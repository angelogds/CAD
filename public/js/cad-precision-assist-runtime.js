const STYLE_ID = 'cadPrecisionAssistStyle';

function loadStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/css/cad-precision-assist.css?v=20260822-v1';
  document.head.appendChild(link);
}

function isEditableTarget(target) {
  const tag = String(target?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
}

function setButtonState(button, active) {
  if (!button) return;
  button.dataset.active = active ? 'true' : 'false';
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function createPanel() {
  const statusbar = document.querySelector('.cad-mlight-statusbar');
  if (!statusbar || document.getElementById('cadPrecisionAssist')) return null;

  const wrapper = document.createElement('div');
  wrapper.id = 'cadPrecisionAssist';
  wrapper.className = 'cad-precision-assist';
  wrapper.innerHTML = `
    <div class="cad-precision-quick" aria-label="Assistência de precisão">
      <button type="button" class="cad-precision-toggle" data-precision="osnap" title="Object Snap (F3)">OSNAP <kbd>F3</kbd></button>
      <button type="button" class="cad-precision-toggle" data-precision="ortho" title="Modo ortogonal (F8)">ORTHO <kbd>F8</kbd></button>
      <button type="button" class="cad-precision-toggle" data-precision="polar" title="Rastreamento polar (F10)">POLAR <kbd>F10</kbd></button>
      <button type="button" class="cad-precision-toggle" data-precision="dynamic" title="Entrada dinâmica">DIN</button>
      <button type="button" class="cad-precision-more" id="cadPrecisionMore" aria-expanded="false">Precisão ▾</button>
    </div>
    <div class="cad-precision-panel" id="cadPrecisionPanel" hidden>
      <div class="cad-precision-panel-head">
        <strong>PRECISÃO DE DESENHO</strong>
        <button type="button" id="cadPrecisionClose" aria-label="Fechar">×</button>
      </div>
      <section>
        <div class="cad-precision-section-title">OBJECT SNAP</div>
        <div class="cad-precision-osnaps" id="cadPrecisionOsnaps"></div>
        <button type="button" class="cad-precision-secondary" id="cadPrecisionDefaultOsnaps">Restaurar OSNAP padrão</button>
      </section>
      <section class="cad-precision-row">
        <label for="cadPrecisionPolarAngle">Incremento polar</label>
        <select id="cadPrecisionPolarAngle" aria-label="Incremento do rastreamento polar"></select>
      </section>
      <section class="cad-precision-help">
        <strong>ENTRADA PRECISA</strong>
        <span><code>100,50</code> coordenada absoluta</span>
        <span><code>@50,0</code> deslocamento relativo</span>
        <span><code>100&lt;45</code> polar absoluto</span>
        <span><code>@100&lt;45</code> polar relativo</span>
        <span><code>100</code> distância na direção do cursor</span>
      </section>
      <p class="cad-precision-note">As coordenadas são interpretadas pelo próprio MLightCAD durante comandos de desenho.</p>
    </div>`;

  const statusActions = statusbar.querySelector('.cad-mlight-status-actions');
  if (statusActions) statusbar.insertBefore(wrapper, statusActions);
  else statusbar.appendChild(wrapper);
  return wrapper;
}

async function initPrecisionAssist() {
  if (!window.CAD_MLIGHT_READY || !window.CAD_MLIGHT_APP) return false;
  loadStyle();
  const root = createPanel();
  if (!root) return false;

  const module = await import('/vendor/mlightcad/mlightcad-precision-assist.js');
  const moreButton = root.querySelector('#cadPrecisionMore');
  const panel = root.querySelector('#cadPrecisionPanel');
  const polarSelect = root.querySelector('#cadPrecisionPolarAngle');
  const osnapContainer = root.querySelector('#cadPrecisionOsnaps');

  const render = (state) => {
    setButtonState(root.querySelector('[data-precision="osnap"]'), state.osnap);
    setButtonState(root.querySelector('[data-precision="ortho"]'), state.ortho);
    setButtonState(root.querySelector('[data-precision="polar"]'), state.polar);
    setButtonState(root.querySelector('[data-precision="dynamic"]'), state.dynamicInput);
    if (polarSelect && String(polarSelect.value) !== String(state.polarAngle)) {
      polarSelect.value = String(state.polarAngle);
    }
    root.querySelectorAll('[data-osnap-mode]').forEach((input) => {
      input.checked = Boolean(state.osnapModes?.[input.dataset.osnapMode]);
    });
  };

  const tools = module.createMlightPrecisionTools({ onChange: render });
  window.CAD_MLIGHT_PRECISION = tools;

  tools.osnapModes.forEach((item) => {
    const label = document.createElement('label');
    label.className = 'cad-precision-check';
    label.innerHTML = `<input type="checkbox" data-osnap-mode="${item.key}"><span>${item.label}</span>`;
    osnapContainer?.appendChild(label);
  });

  tools.polarAngles.forEach((angle) => {
    const option = document.createElement('option');
    option.value = String(angle);
    option.textContent = `${angle}°`;
    polarSelect?.appendChild(option);
  });

  const togglePanel = (force) => {
    const open = typeof force === 'boolean' ? force : Boolean(panel?.hidden);
    if (panel) panel.hidden = !open;
    moreButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  root.querySelector('[data-precision="osnap"]')?.addEventListener('click', () => tools.toggleOsnap());
  root.querySelector('[data-precision="ortho"]')?.addEventListener('click', () => tools.toggleOrtho());
  root.querySelector('[data-precision="polar"]')?.addEventListener('click', () => tools.togglePolar());
  root.querySelector('[data-precision="dynamic"]')?.addEventListener('click', () => tools.toggleDynamicInput());
  moreButton?.addEventListener('click', () => togglePanel());
  root.querySelector('#cadPrecisionClose')?.addEventListener('click', () => togglePanel(false));
  root.querySelector('#cadPrecisionDefaultOsnaps')?.addEventListener('click', () => tools.applyDefaultOsnaps());
  polarSelect?.addEventListener('change', () => tools.setPolarAngle(Number(polarSelect.value)));
  osnapContainer?.addEventListener('change', (event) => {
    const input = event.target?.closest?.('[data-osnap-mode]');
    if (!input) return;
    tools.setOsnapMode(input.dataset.osnapMode, input.checked);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!panel?.hidden && !root.contains(event.target)) togglePanel(false);
  });

  window.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = String(event.key || '').toUpperCase();
    if (!['F3', 'F8', 'F10'].includes(key)) return;
    if (isEditableTarget(event.target) && event.target?.id !== 'mlightCommandInput') return;
    event.preventDefault();
    if (key === 'F3') tools.toggleOsnap();
    if (key === 'F8') tools.toggleOrtho();
    if (key === 'F10') tools.togglePolar();
  });

  render(tools.getState());
  document.documentElement.dataset.cadPrecisionAssist = 'native-v1';
  return true;
}

function bootWhenReady() {
  if (window.CAD_MLIGHT_READY) {
    initPrecisionAssist().catch((error) => console.warn('[CAD][Precisão] falha ao iniciar:', error));
    return;
  }
  window.addEventListener('cad:mlight-ready', () => {
    initPrecisionAssist().catch((error) => console.warn('[CAD][Precisão] falha ao iniciar:', error));
  }, { once: true });
}

bootWhenReady();
