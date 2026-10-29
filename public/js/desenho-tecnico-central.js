(function () {
  'use strict';
  const root = document.querySelector('[data-cad-central]');
  const records = root?.querySelector('[data-cad-records]');
  const controls = root?.querySelector('[data-cad-view-switch]');
  if (!records || !controls) return;
  const storageKey = 'cg.cad.central.view';
  const buttons = controls.querySelectorAll('[data-cad-view]');

  function setView(value, persist = false) {
    const view = value === 'cards' ? 'cards' : 'list';
    records.dataset.view = view;
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.cadView === view)));
    if (persist) {
      try { window.localStorage.setItem(storageKey, view); } catch (_error) { /* Display remains usable without storage. */ }
    }
  }

  let saved = 'list';
  try { saved = window.localStorage.getItem(storageKey); } catch (_error) { /* Use the default list. */ }
  setView(saved);
  buttons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.cadView, true)));
  controls.hidden = false;
})();
