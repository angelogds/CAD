async function callProfessorIA(action) {
  const resposta = document.getElementById('iaResposta');
  const warning = document.getElementById('iaWarning');
  if (!resposta) return;

  const perguntaEl = document.getElementById('iaPergunta');
  const cursoEl = document.getElementById('iaCursoId');
  const pergunta = perguntaEl?.value?.trim() || '';
  const cursoId = cursoEl?.value || '';

  resposta.textContent = 'Consultando Professor IA...';
  if (warning) warning.textContent = '';

  try {
    const r = await fetch('/academia/professor-ia/perguntar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, pergunta, curso_id: cursoId || null }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'Falha ao consultar IA');

    resposta.textContent = data?.resposta || 'Sem resposta.';
    if (warning && data?.warning) warning.textContent = data.warning;
  } catch (err) {
    resposta.textContent = 'Não foi possível consultar o Professor IA agora. Tente novamente.';
    if (warning) warning.textContent = err.message;
  }
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open-external]');
  if (trigger) {
    const url = trigger.getAttribute('data-open-external');
    if (url) window.open(url, '_blank', 'noopener');
    return;
  }

  const iaBtn = event.target.closest('[data-ia-action]');
  if (iaBtn) {
    const action = iaBtn.getAttribute('data-ia-action') || 'perguntar';
    callProfessorIA(action);
  }
});
