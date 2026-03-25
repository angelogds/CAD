(function () {
  async function runPreventivaAI(action, planoId) {
    const statusEl = document.getElementById('preventivaAiStatus');
    const outEl = document.getElementById('preventivaAiResposta');
    if (!statusEl || !outEl || !planoId) return;

    statusEl.textContent = 'Consultando IA...';
    outEl.textContent = '';

    try {
      const response = await fetch(`/ai/preventivas/${planoId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha na análise preventiva.');

      outEl.textContent = data?.resposta || 'Sem resposta.';
      statusEl.textContent = 'Análise concluída.';
    } catch (err) {
      statusEl.textContent = err.message || 'Erro ao consultar IA.';
    }
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-prev-ai-action]');
    if (!btn) return;
    runPreventivaAI(btn.getAttribute('data-prev-ai-action'), btn.getAttribute('data-prev-id'));
  });
})();
