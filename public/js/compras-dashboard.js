(() => {
  const form = document.querySelector('.dashboard-filters');
  if (!form) return;
  const params = new URLSearchParams(location.search);
  for (const field of form.elements) {
    if (field.name && params.has(field.name)) field.value = params.get(field.name);
  }
  form.addEventListener('submit', () => {
    const button = form.querySelector('.refresh-button');
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
  });
})();

document.querySelector('.attention-controls select')?.addEventListener('change', (event) => event.currentTarget.form.submit());

// Cards inteiros funcionam como links. No Safari móvel, arrastar para rolar sobre
// seu texto pode manter uma seleção nativa azul mesmo com `user-select: none`.
const requestList = document.querySelector('.request-list');
if (requestList) {
  const clearRequestSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const touchesRequestRow = [...requestList.querySelectorAll('.request-row')]
      .some((row) => range.intersectsNode(row));

    if (touchesRequestRow) selection.removeAllRanges();
  };

  requestList.addEventListener('selectstart', (event) => {
    if (event.target.closest('.request-row')) event.preventDefault();
  });

  // Limpa também seleções antigas restauradas pelo cache de navegação. Verificar o
  // intervalo inteiro (e não apenas a âncora) cobre arrastos iniciados fora da linha.
  document.addEventListener('selectionchange', clearRequestSelection);
  window.addEventListener('pageshow', clearRequestSelection);
  clearRequestSelection();
}
