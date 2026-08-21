function ensureStyleCss() {
  if (document.querySelector('link[data-cad-style-controls]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/cad-style-controls.css?v=20260821-style-v1';
  link.dataset.cadStyleControls = '1';
  document.head.appendChild(link);
}

function setCadStatus(message, state = 'ok') {
  const el = document.getElementById('mlightCadStatus');
  if (!el) return;
  el.textContent = message;
  el.dataset.state = state;
}

function markDirty() {
  const el = document.getElementById('mlightSaveState');
  if (!el) return;
  el.textContent = 'Alterações não salvas';
  el.dataset.state = 'saving';
}

function option(value, label, selected = false) {
  return `<option value="${String(value).replace(/"/g, '&quot;')}"${selected ? ' selected' : ''}>${label}</option>`;
}

const COLOR_PRESETS = [
  ['bylayer', 'Por camada'],
  ['#f4f7f9', 'Branco / claro'],
  ['#ff3b30', 'Vermelho'],
  ['#ffd60a', 'Amarelo'],
  ['#30d158', 'Verde'],
  ['#64d2ff', 'Ciano'],
  ['#0a84ff', 'Azul'],
  ['#bf5af2', 'Magenta'],
  ['#9aa0a6', 'Cinza'],
  ['custom', 'Personalizada…']
];

function normalizeHex(value, fallback = '#ffffff') {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function colorPresetFor(style) {
  if (style?.colorMode !== 'rgb') return 'bylayer';
  const hex = normalizeHex(style.color);
  return COLOR_PRESETS.some(([value]) => value === hex) ? hex : 'custom';
}

function readStyle(prefix, fallback) {
  const layer = document.getElementById(`${prefix}Layer`)?.value || fallback.layer;
  const preset = document.getElementById(`${prefix}ColorPreset`)?.value || 'bylayer';
  const custom = normalizeHex(document.getElementById(`${prefix}Color`)?.value, fallback.color || '#ffffff');
  const colorMode = preset === 'bylayer' ? 'bylayer' : 'rgb';
  const color = preset === 'custom' ? custom : (preset === 'bylayer' ? custom : normalizeHex(preset, custom));
  const lineType = document.getElementById(`${prefix}LineType`)?.value || fallback.lineType || 'ByLayer';
  const lineWeight = Number(document.getElementById(`${prefix}LineWeight`)?.value ?? fallback.lineWeight ?? -1);
  const lineTypeScale = Math.max(0.01, Number(document.getElementById(`${prefix}LineScale`)?.value || fallback.lineTypeScale || 1));
  return { layer, colorMode, color, lineType, lineWeight, lineTypeScale };
}

function syncColorInput(prefix) {
  const preset = document.getElementById(`${prefix}ColorPreset`);
  const input = document.getElementById(`${prefix}Color`);
  if (!preset || !input) return;
  if (preset.value.startsWith('#')) input.value = normalizeHex(preset.value);
  input.disabled = preset.value === 'bylayer';
  input.classList.toggle('is-muted', preset.value === 'bylayer');
}

function linePreviewStyle(lineType) {
  const value = String(lineType || '').toUpperCase();
  if (value === 'DASHED' || value === 'HIDDEN') return 'dashed';
  if (value === 'CENTER' || value === 'DASHDOT') return 'center';
  return 'continuous';
}

function updatePreviews(tools) {
  const current = readStyle('cadStyle', tools.getCurrentStyle());
  const dim = readStyle('cadDimStyle', tools.getDimensionStyle());
  const currentSwatch = document.getElementById('cadStyleSwatch');
  const currentLine = document.getElementById('cadStyleLinePreview');
  const dimSwatch = document.getElementById('cadDimStyleSwatch');
  const dimLine = document.getElementById('cadDimLinePreview');
  if (currentSwatch) currentSwatch.style.background = current.colorMode === 'rgb' ? current.color : 'linear-gradient(135deg,#596977 0 45%,#202a33 45% 55%,#596977 55%)';
  if (dimSwatch) dimSwatch.style.background = dim.color;
  if (currentLine) currentLine.dataset.lineType = linePreviewStyle(current.lineType);
  if (dimLine) dimLine.dataset.lineType = linePreviewStyle(dim.lineType);
}

function buildStyleGroup(tools) {
  const current = tools.getCurrentStyle();
  const dimension = tools.getDimensionStyle();
  const layers = tools.listLayers();
  const lineTypes = tools.listLineTypes();
  const weights = tools.lineWeights || [];

  const section = document.createElement('section');
  section.className = 'cad-tool-drawer-group cad-style-group';
  section.id = 'cadStyleGroup';
  section.innerHTML = `
    <h3>ESTILO DO DESENHO</h3>
    <div class="cad-style-panel">
      <div class="cad-style-current-head">
        <span id="cadStyleSwatch" class="cad-style-swatch"></span>
        <div><strong>PROPRIEDADES ATUAIS</strong><small>Aplicadas aos próximos objetos</small></div>
        <span id="cadStyleLinePreview" class="cad-style-line-preview" data-line-type="continuous"></span>
      </div>
      <div class="cad-style-grid">
        <label><span>Camada</span><select id="cadStyleLayer">${layers.map((name) => option(name, name, name === current.layer)).join('')}</select></label>
        <label><span>Cor</span><select id="cadStyleColorPreset">${COLOR_PRESETS.map(([value, label]) => option(value, label, value === colorPresetFor(current))).join('')}</select></label>
        <label class="cad-style-color-field"><span>Cor personalizada</span><input id="cadStyleColor" type="color" value="${normalizeHex(current.color)}"></label>
        <label><span>Tipo de linha</span><select id="cadStyleLineType">${lineTypes.map((item) => option(item.name, item.label, item.name === current.lineType)).join('')}</select></label>
        <label><span>Espessura</span><select id="cadStyleLineWeight">${weights.map((item) => option(item.value, item.label, Number(item.value) === Number(current.lineWeight))).join('')}</select></label>
        <label><span>Escala da linha</span><input id="cadStyleLineScale" type="number" min="0.01" step="0.1" value="${Number(current.lineTypeScale || 1)}"></label>
      </div>
      <div class="cad-style-actions">
        <button id="cadStyleSetCurrent" class="cad-style-btn primary" type="button">Usar nos próximos desenhos</button>
        <button id="cadStyleApplySelection" class="cad-style-btn" type="button">Aplicar à seleção</button>
        <button id="cadStyleResetSelection" class="cad-style-btn ghost" type="button">Seleção → BYLAYER</button>
      </div>
    </div>

    <div class="cad-style-panel cad-style-dimension-panel">
      <div class="cad-style-current-head">
        <span id="cadDimStyleSwatch" class="cad-style-swatch"></span>
        <div><strong>COTAS</strong><small>Layer FAB_COTAS • padrão vermelho</small></div>
        <span id="cadDimLinePreview" class="cad-style-line-preview" data-line-type="continuous"></span>
      </div>
      <div class="cad-style-grid">
        <label><span>Cor da cota</span><select id="cadDimStyleColorPreset">${COLOR_PRESETS.filter(([value]) => value !== 'bylayer').map(([value, label]) => option(value, label, value === colorPresetFor(dimension))).join('')}</select></label>
        <label class="cad-style-color-field"><span>Personalizada</span><input id="cadDimStyleColor" type="color" value="${normalizeHex(dimension.color, '#ff3b30')}"></label>
        <label><span>Tipo de linha</span><select id="cadDimStyleLineType">${lineTypes.filter((item) => item.name !== 'ByLayer').map((item) => option(item.name, item.label, item.name === dimension.lineType)).join('')}</select></label>
        <label><span>Espessura</span><select id="cadDimStyleLineWeight">${weights.filter((item) => Number(item.value) >= 0).map((item) => option(item.value, item.label, Number(item.value) === Number(dimension.lineWeight))).join('')}</select></label>
        <label><span>Escala da linha</span><input id="cadDimStyleLineScale" type="number" min="0.01" step="0.1" value="${Number(dimension.lineTypeScale || 1)}"></label>
        <input id="cadDimStyleLayer" type="hidden" value="${tools.dimensionLayer}">
      </div>
      <button id="cadDimStyleApply" class="cad-style-btn danger" type="button">Aplicar estilo em todas as cotas</button>
    </div>`;
  return section;
}

function bindStyleUi(tools) {
  const controls = [
    'cadStyleLayer','cadStyleColorPreset','cadStyleColor','cadStyleLineType','cadStyleLineWeight','cadStyleLineScale',
    'cadDimStyleColorPreset','cadDimStyleColor','cadDimStyleLineType','cadDimStyleLineWeight','cadDimStyleLineScale'
  ];
  controls.forEach((id) => document.getElementById(id)?.addEventListener('input', () => updatePreviews(tools)));
  document.getElementById('cadStyleColorPreset')?.addEventListener('change', () => { syncColorInput('cadStyle'); updatePreviews(tools); });
  document.getElementById('cadDimStyleColorPreset')?.addEventListener('change', () => { syncColorInput('cadDimStyle'); updatePreviews(tools); });
  document.getElementById('cadStyleColor')?.addEventListener('input', () => {
    const preset = document.getElementById('cadStyleColorPreset');
    if (preset) preset.value = 'custom';
    syncColorInput('cadStyle');
    updatePreviews(tools);
  });
  document.getElementById('cadDimStyleColor')?.addEventListener('input', () => {
    const preset = document.getElementById('cadDimStyleColorPreset');
    if (preset) preset.value = 'custom';
    syncColorInput('cadDimStyle');
    updatePreviews(tools);
  });

  document.getElementById('cadStyleSetCurrent')?.addEventListener('click', () => {
    const style = readStyle('cadStyle', tools.getCurrentStyle());
    tools.setCurrentStyle(style);
    markDirty();
    updatePreviews(tools);
  });

  document.getElementById('cadStyleApplySelection')?.addEventListener('click', () => {
    const style = readStyle('cadStyle', tools.getCurrentStyle());
    const result = tools.applyStyleToSelection(style);
    if (result.count) markDirty();
  });

  document.getElementById('cadStyleResetSelection')?.addEventListener('click', () => {
    const result = tools.resetSelectionByLayer();
    if (result.count) markDirty();
  });

  document.getElementById('cadDimStyleApply')?.addEventListener('click', () => {
    const style = readStyle('cadDimStyle', tools.getDimensionStyle());
    const result = tools.setDimensionStyle(style, true);
    markDirty();
    updatePreviews(tools);
    setCadStatus(`Estilo de cotas atualizado • ${result.count} cota(s).`, 'ok');
  });

  syncColorInput('cadStyle');
  syncColorInput('cadDimStyle');
  updatePreviews(tools);
}

async function initStyleControls() {
  if (document.documentElement.dataset.cadStyleControls === 'ready') return true;
  const drawerBody = document.querySelector('#cadToolDrawer .cad-tool-drawer-body');
  if (!window.CAD_MLIGHT_READY || !drawerBody) return false;
  ensureStyleCss();
  const module = await import('/vendor/mlightcad/mlightcad-styles.js');
  const cadData = window.CAD_INITIAL?.data || {};
  const tools = module.createMlightStyleTools({
    cadData,
    onStatus: (message) => setCadStatus(message, 'ok')
  });
  window.CAD_MLIGHT_STYLES = tools;
  const group = buildStyleGroup(tools);
  const firstGroup = drawerBody.querySelector('.cad-tool-drawer-group');
  if (firstGroup?.nextSibling) drawerBody.insertBefore(group, firstGroup.nextSibling);
  else drawerBody.appendChild(group);
  bindStyleUi(tools);
  document.documentElement.dataset.cadStyleControls = 'ready';
  setCadStatus(`Estilos técnicos ativos • cotas em ${tools.getDimensionStyle().color}.`, 'ok');
  return true;
}

async function bootStyleControls() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if (await initStyleControls()) return;
    } catch (error) {
      console.error('[CAD][STYLE] Falha ao iniciar estilos:', error);
      setCadStatus(`Estilos técnicos indisponíveis: ${error.message || error}`, 'error');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.warn('[CAD][STYLE] Drawer não ficou pronto a tempo.');
}

await bootStyleControls();
