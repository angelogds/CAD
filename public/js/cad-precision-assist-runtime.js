const STYLE_ID = 'cadPrecisionAssistStyle';

function loadStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/css/cad-precision-assist.css?v=20260822-v2';
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

function formatValue(value, decimals = 3) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(decimals) : '0.000';
}

function createPanel() {
  const statusbar = document.querySelector('.cad-mlight-statusbar');
  if (!statusbar || document.getElementById('cadPrecisionAssist')) return null;

  const wrapper = document.createElement('div');
  wrapper.id = 'cadPrecisionAssist';
  wrapper.className = 'cad-precision-assist';
  wrapper.innerHTML = `
    <div class="cad-precision-quick" aria-label="Assistência de precisão">
      <span class="cad-precision-coords" id="cadPrecisionCoords" title="Coordenadas WCS do cursor">X 0.000&nbsp;&nbsp;Y 0.000</span>
      <button type="button" class="cad-precision-toggle" data-precision="osnap" title="Object Snap (F3)">OSNAP <kbd>F3</kbd></button>
      <button type="button" class="cad-precision-toggle" data-precision="ortho" title="Modo ortogonal (F8)">ORTHO <kbd>F8</kbd></button>
      <button type="button" class="cad-precision-toggle" data-precision="polar" title="Rastreamento polar (F10)">POLAR <kbd>F10</kbd></button>
      <button type="button" class="cad-precision-toggle" data-precision="dynamic" title="Entrada dinâmica">DIN</button>
      <button type="button" class="cad-precision-action" id="cadPrecisionMeasure" title="Medir distância entre dois pontos">MEDIR</button>
      <button type="button" class="cad-precision-action" id="cadPrecisionPolarLine" title="Criar linha por distância e ângulo">L D×Â</button>
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
      <section>
        <div class="cad-precision-section-title">LINHA POR DISTÂNCIA × ÂNGULO</div>
        <div class="cad-precision-form-grid">
          <label>Distância
            <input id="cadPrecisionLineDistance" type="number" min="0.001" step="0.001" value="100" inputmode="decimal">
          </label>
          <label>Ângulo
            <input id="cadPrecisionLineAngle" type="number" step="0.1" value="0" inputmode="decimal">
          </label>
        </div>
        <button type="button" class="cad-precision-primary" id="cadPrecisionCreatePolarLine">Selecionar ponto e criar linha</button>
        <p class="cad-precision-note">A geometria é criada pelo comando LINE do MLightCAD usando coordenada relativa polar.</p>
      </section>
      <section>
        <div class="cad-precision-section-title">MEDIÇÃO RÁPIDA</div>
        <div class="cad-precision-measure-result" id="cadPrecisionMeasureResult">
          <span>Selecione MEDIR e informe dois pontos no desenho.</span>
        </div>
        <div class="cad-precision-inline-actions">
          <button type="button" class="cad-precision-secondary" id="cadPrecisionMeasureAgain">Medir distância</button>
          <button type="button" class="cad-precision-secondary" data-native-measure="angle">Ângulo nativo</button>
          <button type="button" class="cad-precision-secondary" data-native-measure="area">Área nativa</button>
        </div>
      </section>
      <section class="cad-precision-help">
        <strong>ENTRADA PRECISA</strong>
        <span><code>100,50</code> coordenada absoluta</span>
        <span><code>@50,0</code> deslocamento relativo</span>
        <span><code>100&lt;45</code> polar absoluto</span>
        <span><code>@100&lt;45</code> polar relativo</span>
        <span><code>100</code> distância na direção do cursor</span>
      </section>
      <div class="cad-precision-footer-row">
        <button type="button" class="cad-precision-secondary" id="cadPrecisionCopyCoords">Copiar XY atual</button>
        <span class="cad-precision-feedback" id="cadPrecisionFeedback" aria-live="polite"></span>
      </div>
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
  const coords = root.querySelector('#cadPrecisionCoords');
  const feedback = root.querySelector('#cadPrecisionFeedback');
  const measureResult = root.querySelector('#cadPrecisionMeasureResult');
  const distanceInput = root.querySelector('#cadPrecisionLineDistance');
  const angleInput = root.querySelector('#cadPrecisionLineAngle');
  let currentCursor = { x: 0, y: 0 };

  const setFeedback = (message = '', isError = false) => {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.dataset.error = isError ? 'true' : 'false';
  };

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

  const unsubscribeCursor = tools.subscribeCursor((point) => {
    currentCursor = { x: point.x, y: point.y };
    if (coords) coords.textContent = point.text;
  });

  const togglePanel = (force) => {
    const open = typeof force === 'boolean' ? force : Boolean(panel?.hidden);
    if (panel) panel.hidden = !open;
    moreButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const runMeasure = async () => {
    setFeedback('Selecione os dois pontos no desenho.');
    try {
      const result = await tools.measureDistance();
      if (!result) {
        setFeedback('Medição cancelada.');
        return;
      }
      if (measureResult) {
        measureResult.innerHTML = `
          <strong>${formatValue(result.distance)} u</strong>
          <span>ΔX ${formatValue(result.dx)} · ΔY ${formatValue(result.dy)}</span>
          <span>Ângulo ${formatValue(result.angleDeg, 2)}°</span>`;
      }
      setFeedback(`Distância medida: ${formatValue(result.distance)}.`);
      togglePanel(true);
    } catch (error) {
      setFeedback(error?.message || 'Não foi possível medir.', true);
    }
  };

  const createPolarLine = async () => {
    const distance = Number(distanceInput?.value);
    const angleDeg = Number(angleInput?.value);
    if (!(distance > 0) || !Number.isFinite(angleDeg)) {
      setFeedback('Informe distância maior que zero e um ângulo válido.', true);
      return;
    }
    setFeedback('Selecione o ponto inicial da linha no desenho.');
    try {
      const result = await tools.createPolarLine({ distance, angleDeg });
      if (!result) {
        setFeedback('Criação da linha cancelada.');
        return;
      }
      setFeedback(`LINE ${result.startToken} → ${result.polarToken}`);
      togglePanel(false);
    } catch (error) {
      setFeedback(error?.message || 'Não foi possível criar a linha.', true);
    }
  };

  root.querySelector('[data-precision="osnap"]')?.addEventListener('click', () => tools.toggleOsnap());
  root.querySelector('[data-precision="ortho"]')?.addEventListener('click', () => tools.toggleOrtho());
  root.querySelector('[data-precision="polar"]')?.addEventListener('click', () => tools.togglePolar());
  root.querySelector('[data-precision="dynamic"]')?.addEventListener('click', () => tools.toggleDynamicInput());
  root.querySelector('#cadPrecisionMeasure')?.addEventListener('click', runMeasure);
  root.querySelector('#cadPrecisionMeasureAgain')?.addEventListener('click', runMeasure);
  root.querySelector('#cadPrecisionPolarLine')?.addEventListener('click', () => {
    togglePanel(true);
    distanceInput?.focus();
    distanceInput?.select?.();
  });
  root.querySelector('#cadPrecisionCreatePolarLine')?.addEventListener('click', createPolarLine);
  moreButton?.addEventListener('click', () => togglePanel());
  root.querySelector('#cadPrecisionClose')?.addEventListener('click', () => togglePanel(false));
  root.querySelector('#cadPrecisionDefaultOsnaps')?.addEventListener('click', () => tools.applyDefaultOsnaps());
  polarSelect?.addEventListener('change', () => tools.setPolarAngle(Number(polarSelect.value)));
  osnapContainer?.addEventListener('change', (event) => {
    const input = event.target?.closest?.('[data-osnap-mode]');
    if (!input) return;
    tools.setOsnapMode(input.dataset.osnapMode, input.checked);
  });
  root.querySelectorAll('[data-native-measure]').forEach((button) => {
    button.addEventListener('click', () => {
      tools.runNativeMeasurement(button.dataset.nativeMeasure);
      togglePanel(false);
    });
  });
  root.querySelector('#cadPrecisionCopyCoords')?.addEventListener('click', async () => {
    const text = `${formatValue(currentCursor.x)},${formatValue(currentCursor.y)}`;
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`Coordenada copiada: ${text}`);
    } catch (_error) {
      setFeedback(`XY atual: ${text}`);
    }
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

  window.addEventListener('beforeunload', () => {
    try { unsubscribeCursor?.(); } catch (_error) {}
    try { tools.dispose?.(); } catch (_error) {}
  }, { once: true });

  render(tools.getState());
  document.documentElement.dataset.cadPrecisionAssist = 'native-v2';
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
