(function () {
  'use strict';

  const root = document.querySelector('[data-os-chat-root]');
  if (!root || root.dataset.chatInitialized === '1') return;
  root.dataset.chatInitialized = '1';

  const messagesContainer = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const textarea = document.getElementById('chat-input');
  const submitButton = document.getElementById('chat-submit');
  const statusBox = document.getElementById('chat-status');
  if (!messagesContainer || !form || !textarea || !submitButton) return;

  const osId = root.dataset.osId;
  const userId = root.dataset.userId || 'anonimo';
  const draftKey = `chat-os-draft:${userId}:${osId}`;
  const pollingMs = Number(root.dataset.pollingMs || 20000);
  let pollingId = null;
  let lastSignature = '';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (_err) { return null; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (_err) {}
  }

  function deleteStorage(key) {
    try { localStorage.removeItem(key); } catch (_err) {}
  }

  function showStatus(message, type) {
    if (!statusBox) return;
    statusBox.textContent = message || '';
    statusBox.dataset.type = type || '';
    statusBox.hidden = !message;
  }

  function saveDraft(value) {
    const text = typeof value === 'string' ? value : textarea.value;
    if (text) writeStorage(draftKey, text);
    else deleteStorage(draftKey);
  }

  function restoreDraft() {
    const draft = readStorage(draftKey);
    if (draft !== null && textarea.value !== draft) textarea.value = draft;
  }

  function removeDraft() {
    deleteStorage(draftKey);
  }

  function isNearBottom(element) {
    return element.scrollHeight - element.scrollTop - element.clientHeight < 90;
  }

  function renderMessages(messages) {
    const activeElement = document.activeElement;
    const hadFocus = activeElement === textarea;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const shouldStickToBottom = isNearBottom(messagesContainer);
    const draftBeforeUpdate = textarea.value;

    if (!messages.length) {
      messagesContainer.innerHTML = '<div class="os-chat-empty">Ainda não há mensagens. Registre a primeira tratativa da OS.</div>';
    } else {
      messagesContainer.innerHTML = messages.map((message) => {
        const mine = Number(message.user_id || 0) === Number(userId || 0);
        const tipo = String(message.tipo || 'MENSAGEM').toLowerCase();
        const system = tipo === 'sistema' || tipo.includes('solicitacao');
        const classes = ['msg', mine ? 'mine' : '', system ? 'system' : ''].filter(Boolean).join(' ');
        return `
          <article class="${classes}" data-message-id="${escapeHtml(message.id)}">
            <div class="msg-head"><strong>${escapeHtml(message.tipo || 'MENSAGEM')} • ${escapeHtml(message.autor_nome || 'Sistema')}</strong><span>${escapeHtml(message.created_at_fmt || message.created_at || '-')}</span></div>
            <p>${escapeHtml(message.mensagem)}</p>
          </article>`;
      }).join('');
    }

    textarea.value = draftBeforeUpdate;
    if (hadFocus) {
      textarea.focus({ preventScroll: true });
      try { textarea.setSelectionRange(selectionStart, selectionEnd); } catch (_err) {}
    }
    if (shouldStickToBottom) messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function signature(messages) {
    return messages.map((message) => `${message.id}:${message.created_at}`).join('|');
  }

  async function refreshMessages() {
    const response = await fetch(`/chat-os/${encodeURIComponent(osId)}/mensagens`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Falha ao atualizar mensagens.');
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Falha ao atualizar mensagens.');
    const messages = Array.isArray(data.mensagens) ? data.mensagens : [];
    const nextSignature = signature(messages);
    if (nextSignature !== lastSignature) {
      renderMessages(messages);
      lastSignature = nextSignature;
    }
  }

  function startPolling() {
    if (pollingId) clearInterval(pollingId);
    pollingId = setInterval(() => {
      if (document.hidden || form.dataset.enviando === '1') return;
      refreshMessages().catch(() => {
        showStatus('Não foi possível atualizar as mensagens agora. Seu texto foi preservado.', 'error');
      });
    }, pollingMs);
  }

  textarea.addEventListener('input', () => {
    saveDraft();
    showStatus('', '');
  });

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.enviando === '1') return;

    const originalText = textarea.value;
    const text = originalText.trim();
    if (!text) {
      textarea.value = originalText;
      saveDraft(originalText);
      showStatus('Digite uma mensagem antes de enviar.', 'error');
      textarea.focus();
      return;
    }

    form.dataset.enviando = '1';
    submitButton.disabled = true;
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = 'Enviando...';
    showStatus('Enviando mensagem...', 'info');

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ mensagem: text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Falha ao enviar mensagem.');

      textarea.value = '';
      removeDraft();
      showStatus('Mensagem enviada.', 'success');
      await refreshMessages();
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      textarea.focus({ preventScroll: true });
    } catch (error) {
      textarea.value = originalText;
      saveDraft(originalText);
      showStatus('Não foi possível enviar a mensagem. O texto digitado foi preservado.', 'error');
      textarea.focus({ preventScroll: true });
    } finally {
      form.dataset.enviando = '0';
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  });

  window.addEventListener('beforeunload', () => saveDraft());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshMessages().catch(() => {});
  });

  restoreDraft();
  lastSignature = messagesContainer.dataset.signature || '';
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  startPolling();
}());
