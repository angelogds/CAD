(function () {
  const launcher = document.getElementById('aiGlobalLauncher');
  const panel = document.getElementById('aiGlobalPanel');
  const backdrop = document.getElementById('aiGlobalBackdrop');
  const closeBtn = document.getElementById('aiGlobalClose');
  const contextLabel = document.getElementById('aiGlobalContextLabel');
  const contextDetail = document.getElementById('aiGlobalContextDetail');
  const messages = document.getElementById('aiGlobalMessages');
  const input = document.getElementById('aiGlobalInput');
  const sendBtn = document.getElementById('aiGlobalSend');
  const statusEl = document.getElementById('aiGlobalStatus');
  const openFull = document.getElementById('aiGlobalOpenFull');
  if (!launcher || !panel || !backdrop || !closeBtn || !messages || !input || !sendBtn) return;

  if (window.location.pathname === '/ai/chat') {
    launcher.hidden = true;
    panel.hidden = true;
    backdrop.hidden = true;
    return;
  }

  const sourceRoute = `${window.location.pathname}${window.location.search}`;
  const storageKey = 'cg_ai_industrial_conversation_id_v1';
  let conversationId = sessionStorage.getItem(storageKey) || '';
  let contextLoaded = false;
  let busy = false;

  if (!conversationId) {
    conversationId = window.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(storageKey, conversationId);
  }

  openFull.href = `/ai/chat?source=${encodeURIComponent(sourceRoute)}`;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = String(text || '');
  }

  function clearEmptyState() {
    const empty = messages.querySelector('.ai-global-empty');
    if (empty) empty.remove();
  }

  function addMessage(role, text, tools, sources) {
    clearEmptyState();
    const bubble = document.createElement('div');
    bubble.className = `ai-global-msg ${role === 'user' ? 'user' : 'ai'}`;
    bubble.textContent = String(text || '');
    messages.appendChild(bubble);

    if (Array.isArray(tools) && tools.length) {
      const toolLine = document.createElement('div');
      toolLine.className = 'ai-global-tools';
      const names = tools.filter((item) => item?.ok !== false).map((item) => item?.name).filter(Boolean);
      if (names.length) {
        toolLine.textContent = `Consultas: ${[...new Set(names)].join(', ')}`;
        messages.appendChild(toolLine);
      }
    }

    if (Array.isArray(sources) && sources.length) {
      const sourceLine = document.createElement('div');
      sourceLine.className = 'ai-global-tools';
      const labels = [...new Set(sources.map((item) => item?.source).filter(Boolean))];
      if (labels.length) {
        sourceLine.textContent = `Fontes do sistema: ${labels.join(' • ')}`;
        messages.appendChild(sourceLine);
      }
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function describeContext(context) {
    const details = context?.details || {};
    const parts = [];
    if (details.status) parts.push(`Status: ${details.status}`);
    if (details.prioridade) parts.push(`Prioridade: ${details.prioridade}`);
    if (details.setor || details.setor_origem) parts.push(`Setor: ${details.setor || details.setor_origem}`);
    if (details.tipo) parts.push(`Tipo: ${details.tipo}`);
    if (details.criticidade) parts.push(`Criticidade: ${details.criticidade}`);
    return parts.slice(0, 3).join(' • ');
  }

  async function loadContext() {
    if (contextLoaded) return;
    try {
      const response = await fetch(`/ai/industrial/context?route=${encodeURIComponent(sourceRoute)}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Falha ao identificar contexto.');
      const context = data.context || {};
      contextLabel.textContent = context.label || 'Contexto geral';
      contextDetail.textContent = describeContext(context);
      contextLoaded = true;
    } catch (err) {
      contextLoaded = false;
      contextLabel.textContent = 'Contexto geral';
      contextDetail.textContent = '';
      setStatus(err?.message || 'Contexto automático indisponível.');
    }
  }

  function openPanel() {
    panel.classList.add('open');
    backdrop.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    backdrop.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    loadContext();
    window.setTimeout(() => input.focus(), 80);
  }

  function closePanel() {
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  }

  async function sendMessage() {
    if (busy) return;
    const text = String(input.value || '').trim();
    if (!text) {
      setStatus('Digite uma pergunta.');
      return;
    }

    busy = true;
    sendBtn.disabled = true;
    input.disabled = true;
    setStatus('Consultando o sistema…');
    addMessage('user', text);
    input.value = '';

    try {
      const response = await fetch('/ai/industrial/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          route: sourceRoute,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Falha ao consultar o Assistente Industrial.');
      if (data.conversation_id) {
        conversationId = String(data.conversation_id);
        sessionStorage.setItem(storageKey, conversationId);
      }
      if (data.context?.label) {
        contextLabel.textContent = data.context.label;
        contextDetail.textContent = describeContext(data.context);
        contextLoaded = true;
      }
      addMessage('ai', data.resposta || 'Sem resposta.', data.tools || [], data.sources || []);
      setStatus('Resposta recebida.');
    } catch (err) {
      addMessage('ai', `Não foi possível concluir a consulta: ${err?.message || 'erro inesperado.'}`);
      setStatus('Falha na consulta.');
      if (/sessão|login/i.test(String(err?.message || ''))) sessionStorage.removeItem(storageKey);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  launcher.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.classList.contains('open')) closePanel();
  });
})();
