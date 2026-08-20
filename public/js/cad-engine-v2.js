const params = new URLSearchParams(window.location.search);
const forceLegacy = params.get('engine') === 'legacy';

async function loadLegacy(reason = '') {
  if (reason) console.warn('[CAD] Motor profissional não iniciado; fallback SVG:', reason);
  document.documentElement.dataset.cadEngine = 'legacy-svg';
  await import('./cad-legacy-engine.js');
}

if (forceLegacy) {
  await loadLegacy('fallback solicitado pelo usuário');
} else {
  try {
    await import('./cad-mlight-runtime.js');
  } catch (error) {
    await loadLegacy(error?.message || String(error));
  }
}
