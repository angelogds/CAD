(function () {
  const storageKey = 'cg_ai_chat_history_v2';
  const conversationStorageKey = 'cg_ai_chat_conversation_id_v1';
  const historyEl = document.getElementById('aiHistory');
  const perguntaEl = document.getElementById('aiPergunta');
  const contextoEl = document.getElementById('aiContexto');
  const statusEl = document.getElementById('aiStatus');
  const enviarBtn = document.getElementById('aiEnviar');
  const limparBtn = document.getElementById('aiLimpar');

  if (!historyEl) return;

  function safeInternalPath(value) {
    const raw = String(value || '').trim();
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      return `${url.pathname}${url.search}`.slice(0, 700);
    } catch (_e) {
      return null;
    }
  }

  const sourceParam = new URLSearchParams(window.location.search).get('source');
  const sourceRoute = safeInternalPath(sourceParam) || '/ai/chat';
  let conversationId = sessionStorage.getItem(conversationStorageKey) || '';
  if (!conversationId) {
    conversationId = window.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(conversationStorageKey, conversationId);
  }

  const backLink = document.querySelector('.assistant-hero a.btn[href]');
  if (backLink && sourceRoute !== '/ai/chat' && !sourceRoute.startsWith('/auth/')) backLink.href = sourceRoute;

  function readHistory() {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (_e) { return []; }
  }

  function saveHistory(items) {
    localStorage.setItem(storageKey, JSON.stringify(items.slice(-40)));
  }

  function addBubble(role, label, text, tools) {
    const el = document.createElement('div');
    el.className = `assistant-msg ${role === 'user' ? 'user' : 'ai'}`;
    const strong = document.createElement('strong');
    strong.textContent = label;
    el.appendChild(strong);
    el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(String(text || '')));

    if (role !== 'user' && Array.isArray(tools) && tools.length) {
      const source = document.createElement('div');
      source.className = 'assistant-muted';
      source.style.marginTop = '8px';
      const used = tools.filter((tool) => tool?.ok).map((tool) => tool.name);
      const blocked = tools.filter((tool) => !tool?.ok).map((tool) => tool.name);
      const parts = [];
      if (used.length) parts.push(`Consultas: ${[...new Set(used)].join(', ')}`);
      if (blocked.length) parts.push(`Bloqueadas: ${[...new Set(blocked)].join(', ')}`);
      source.textContent = parts.join(' • ');
      if (source.textContent) el.appendChild(source);
    }
    historyEl.appendChild(el);
  }

  function renderHistory() {
    historyEl.replaceChildren();
    const items = readHistory();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'assistant-muted';
      empty.textContent = 'Sem interações ainda.';
      historyEl.appendChild(empty);
      return;
    }
    items.forEach((item) => {
      addBubble('user', `Você (${item.contextLabel || item.contexto || 'geral'}):`, item.pergunta);
      addBubble('ai', 'Assistente:', item.resposta || 'Sem resposta.', item.tools || []);
    });
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  async function loadPageContext() {
    if (sourceRoute === '/ai/chat') return;
    try {
      const response = await fetch(`/ai/industrial/context?route=${encodeURIComponent(sourceRoute)}`, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data?.ok) return;
      if (statusEl && data.context?.label) statusEl.textContent = `Contexto automático: ${data.context.label}`;
    } catch (_e) {}
  }

  async function enviarPergunta() {
    const pergunta = (perguntaEl?.value || '').trim();
    const contexto = (contextoEl?.value || 'geral').trim();
    if (!pergunta) {
      statusEl.textContent = 'Digite uma pergunta antes de enviar.';
      return;
    }

    statusEl.textContent = 'Consultando dados reais do sistema...';
    enviarBtn.disabled = true;
    try {
      const response = await fetch('/ai/industrial/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          pergunta,
          contexto,
          conversation_id: conversationId,
          route: sourceRoute,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Falha ao consultar IA.');
      if (data.conversation_id) {
        conversationId = String(data.conversation_id);
        sessionStorage.setItem(conversationStorageKey, conversationId);
      }
      const items = readHistory();
      items.push({
        pergunta,
        contexto,
        contextLabel: data.context?.label || contexto,
        resposta: data.resposta || 'Sem resposta.',
        tools: Array.isArray(data.tools) ? data.tools : [],
      });
      saveHistory(items);
      renderHistory();
      const used = (data.tools || []).filter((tool) => tool?.ok).length;
      const contextText = data.context?.label ? ` • ${data.context.label}` : '';
      statusEl.textContent = used ? `Resposta recebida com ${used} consulta(s) ao sistema${contextText}.` : `Resposta recebida${contextText}.`;
      perguntaEl.value = '';
    } catch (err) {
      statusEl.textContent = err.message || 'Erro ao consultar IA.';
    } finally {
      enviarBtn.disabled = false;
    }
  }

  enviarBtn?.addEventListener('click', enviarPergunta);
  perguntaEl?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') enviarPergunta();
  });
  limparBtn?.addEventListener('click', () => {
    localStorage.removeItem(storageKey);
    renderHistory();
    statusEl.textContent = 'Histórico local limpo.';
  });

  renderHistory();
  loadPageContext();
})();
