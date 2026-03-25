(function () {
  function appendPreventivaMessage(role, text) {
    const log = document.getElementById('preventivaAiChat');
    if (!log) return;

    const item = document.createElement('div');
    item.innerHTML = `<strong>${role === 'user' ? 'Você' : 'Professora IA'}:</strong> ${String(text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
    return item;
  }

  async function runPreventivaAI(planoId) {
    const statusEl = document.getElementById('preventivaAiStatus');
    const perguntaEl = document.getElementById('preventivaAiPergunta');
    const actionEl = document.getElementById('preventivaAiAction');
    if (!statusEl || !planoId) return;

    const pergunta = String(perguntaEl?.value || '').trim();
    const action = String(actionEl?.value || 'perguntar');
    if (!pergunta) {
      statusEl.textContent = 'Digite uma pergunta para continuar.';
      return;
    }

    appendPreventivaMessage('user', pergunta);
    const loading = appendPreventivaMessage('assistant', 'Analisando plano preventivo...');
    statusEl.textContent = 'Consultando IA...';

    try {
      const response = await fetch(`/ai/preventivas/${planoId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pergunta }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha na análise preventiva.');

      if (loading) loading.innerHTML = `<strong>Professora IA:</strong> ${String(data?.resposta || 'Sem resposta.').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}`;
      statusEl.textContent = 'Análise concluída.';
      if (perguntaEl) perguntaEl.value = '';
    } catch (err) {
      statusEl.textContent = err.message || 'Erro ao consultar IA.';
      if (loading) loading.innerHTML = '<strong>Professora IA:</strong> Não foi possível responder agora.';
    }
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-prev-ai-action]');
    if (!btn) return;
    runPreventivaAI(btn.getAttribute('data-prev-id'));
  });
})();
