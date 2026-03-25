(function () {
  async function runOSAI(action, osId) {
    const statusEl = document.getElementById('osAiStatus');
    const outEl = document.getElementById('osAiResposta');
    if (!statusEl || !outEl || !osId) return;

    statusEl.textContent = 'Consultando IA...';
    outEl.textContent = '';

    try {
      const response = await fetch(`/ai/os/${osId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha na análise da OS.');

      outEl.textContent = data?.resposta || 'Sem resposta.';
      statusEl.textContent = 'Análise concluída.';
    } catch (err) {
      statusEl.textContent = err.message || 'Erro ao consultar IA.';
    }
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-os-ai-action]');
    if (!btn) return;
    runOSAI(btn.getAttribute('data-os-ai-action'), btn.getAttribute('data-os-id'));
  });
})();
