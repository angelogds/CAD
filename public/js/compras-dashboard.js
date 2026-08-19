(() => {
  const form = document.querySelector('.dashboard-filters');
  if (!form) return;
  const params = new URLSearchParams(location.search);
  for (const field of form.elements) {
    if (field.name && params.has(field.name)) field.value = params.get(field.name);
  }
  form.addEventListener('submit', () => {
    const button = form.querySelector('.refresh-button');
    if (!button) return;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
  });
})();

document.querySelector('.attention-controls select')?.addEventListener('change', (event) => event.currentTarget.form.submit());

// A fila operacional é clicável por linha. Em Safari/iOS e em alguns cenários
// do Chromium, arrastar para rolar ou clicar repetidamente pode deixar um Range
// de seleção nativo pintado sobre OS/equipamento e dados da compra. A limpeza é
// restrita à .request-list para não interferir nos filtros da página.
const requestList = document.querySelector('.request-list');
if (requestList) {
  const getSelectionElement = (node) => {
    if (!node) return null;
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  };

  const selectionTouchesRequestRow = (selection) => {
    if (!selection || selection.rangeCount === 0) return false;

    const anchorEl = getSelectionElement(selection.anchorNode);
    const focusEl = getSelectionElement(selection.focusNode);
    if (anchorEl?.closest('.request-row') || focusEl?.closest('.request-row')) return true;

    try {
      const range = selection.getRangeAt(0);
      return [...requestList.querySelectorAll('.request-row')].some((row) => range.intersectsNode(row));
    } catch (_) {
      return false;
    }
  };

  const clearRequestSelection = (force = false) => {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) return;
    if (!force && !selectionTouchesRequestRow(selection)) return;
    try { selection.removeAllRanges(); } catch (_) {}
  };

  const scheduleSelectionClear = (force = false) => {
    requestAnimationFrame(() => clearRequestSelection(force));
    window.setTimeout(() => clearRequestSelection(force), 0);
    window.setTimeout(() => clearRequestSelection(force), 60);
  };

  requestList.addEventListener('selectstart', (event) => {
    if (!event.target.closest('.request-row')) return;
    event.preventDefault();
    scheduleSelectionClear(true);
  });

  requestList.addEventListener('dragstart', (event) => {
    if (!event.target.closest('.request-row')) return;
    event.preventDefault();
    scheduleSelectionClear(true);
  });

  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'].forEach((eventName) => {
    requestList.addEventListener(eventName, (event) => {
      if (!event.target.closest('.request-row')) return;
      scheduleSelectionClear(true);
    }, { passive: true });
  });

  document.addEventListener('selectionchange', () => clearRequestSelection(false));
  window.addEventListener('pageshow', () => scheduleSelectionClear(true));
  window.addEventListener('blur', () => scheduleSelectionClear(true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSelectionClear(true);
  });

  scheduleSelectionClear(true);
}
