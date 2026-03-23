(function () {
  const storageKey = 'cg_ai_chat_history_v1';
  const historyEl = document.getElementById('aiHistory');
  const perguntaEl = document.getElementById('aiPergunta');
  const contextoEl = document.getElementById('aiContexto');
  const statusEl = document.getElementById('aiStatus');
  const enviarBtn = document.getElementById('aiEnviar');
  const limparBtn = document.getElementById('aiLimpar');

  if (!historyEl) return;

  function readHistory() {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (_e) { return []; }
  }

  function saveHistory(items) {
    localStorage.setItem(storageKey, JSON.stringify(items.slice(-30)));
  }

  function renderHistory() {
    const items = readHistory();
    if (!items.length) {
      historyEl.innerHTML = '<div class="ai-muted">Sem interações ainda.</div>';
      return;
    }

    historyEl.innerHTML = items.map((item) => `
      <div class="ai-bubble user"><strong>Você (${item.contexto}):</strong><br>${item.pergunta}</div>
      <div class="ai-bubble"><strong>IA:</strong><br>${item.resposta}</div>
    `).join('');

    historyEl.scrollTop = historyEl.scrollHeight;
  }

  async function enviarPergunta() {
    const pergunta = (perguntaEl?.value || '').trim();
    const contexto = (contextoEl?.value || 'geral').trim();

    if (!pergunta) {
      statusEl.textContent = 'Digite uma pergunta antes de enviar.';
      return;
    }

    statusEl.textContent = 'Consultando IA...';
    enviarBtn.disabled = true;

    try {
      const response = await fetch('/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, contexto }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao consultar IA.');

      const items = readHistory();
      items.push({ pergunta, contexto, resposta: data.resposta || 'Sem resposta.' });
      saveHistory(items);
      renderHistory();
      statusEl.textContent = 'Resposta recebida.';
      perguntaEl.value = '';
    } catch (err) {
      statusEl.textContent = err.message || 'Erro ao consultar IA.';
    } finally {
      enviarBtn.disabled = false;
    }
  }

  enviarBtn?.addEventListener('click', enviarPergunta);
  limparBtn?.addEventListener('click', () => {
    localStorage.removeItem(storageKey);
    renderHistory();
    statusEl.textContent = 'Histórico local limpo.';
  });

  renderHistory();
})();
