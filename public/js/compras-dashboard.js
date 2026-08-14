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
  requestList.addEventListener('selectstart', (event) => {
    if (event.target.closest('.request-row')) event.preventDefault();
  });

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    if (element?.closest?.('.request-row')) selection.removeAllRanges();
  });
}
