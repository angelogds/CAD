document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open-external]');
  if (trigger) {
    const url = trigger.getAttribute('data-open-external');
    if (url) window.open(url, '_blank', 'noopener');
    return;
  }

  if (event.target.id === 'iaPerguntar') {
    const pergunta = document.getElementById('iaPergunta')?.value?.trim();
    const resposta = document.getElementById('iaResposta');
    if (!resposta) return;

    if (!pergunta) {
      resposta.textContent = 'Digite uma pergunta para o Professor IA.';
      return;
    }

    resposta.textContent = `Em implantação: análise iniciada para “${pergunta}”. Enquanto isso, revise a trilha Conhecimento da Fábrica e finalize a avaliação do curso atual.`;
  }
});
