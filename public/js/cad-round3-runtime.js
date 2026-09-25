function ensureRound3Styles() {
  if (document.querySelector('link[data-cad-round3-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/cad-round3.css?v=20260920-plot-ui-v2';
  link.dataset.cadRound3Style = '1';
  document.head.appendChild(link);
}

function setCadStatus(message, state = 'ok') {
  const el = document.getElementById('mlightCadStatus');
  if (!el) return;
  el.textContent = message;
  el.dataset.state = state;
}

function setSaveDirty() {
  const el = document.getElementById('mlightSaveState');
  if (!el) return;
  el.textContent = 'Alterações não salvas';
  el.dataset.state = 'saving';
}

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function numberText(value, unit = '', digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(n)}${unit ? ` ${unit}` : ''}`;
}

function injectRound3Ui() {
  const fabbar = document.querySelector('.cad-mlight-fabbar');
  if (fabbar && !document.getElementById('mlightPaperLayoutBtn')) {
    fabbar.insertAdjacentHTML('beforeend', `
      <span class="cad-round3-divider" aria-hidden="true"></span>
      <button id="mlightProjectedViewsBtn" class="cad-mlight-action cad-round3-strong" type="button" title="Gerar vistas projetadas da peça reconhecida">▧ <span>Vistas Auto</span></button>
      <button id="mlightPaperLayoutBtn" class="cad-mlight-action cad-round3-strong" type="button" title="Criar Layout A3/A4 em Paper Space com escala">▤ <span>Layout</span></button>
      <button id="mlightTechAnalysisBtn" class="cad-mlight-action cad-round3-analysis" type="button" title="Área, volume, massa, material e validação via Python">Σ <span>Análise técnica</span></button>
      <span id="mlightPythonBadge" class="cad-round3-python" data-state="loading">MOTOR TÉCNICO • verificando</span>
    `);
  }

  const main = document.querySelector('.cad-mlight-main');
  if (main && !document.getElementById('cadRound3LayoutTabs')) {
    main.insertAdjacentHTML('beforeend', `
      <nav id="cadRound3LayoutTabs" class="cad-round3-layout-tabs" aria-label="Model e layouts técnicos">
        <button type="button" data-layout-tab="Model" class="is-active">MODEL</button>
        <button type="button" data-layout-tab="A4">LAYOUT A4</button>
        <button type="button" data-layout-tab="A3">LAYOUT A3</button>
      </nav>
      <section id="cadRound3Analysis" class="cad-round3-analysis-panel" hidden aria-modal="true" role="dialog" aria-labelledby="cadRound3AnalysisTitle">
        <header>
          <div><small>MOTOR TÉCNICO PYTHON</small><h2 id="cadRound3AnalysisTitle">Análise de fabricação</h2></div>
          <button type="button" id="cadRound3AnalysisClose" aria-label="Fechar">×</button>
        </header>
        <div id="cadRound3AnalysisBody" class="cad-round3-analysis-body">
          <p>Executando análise…</p>
        </div>
      </section>

      <section id="cadRound3LayoutPanel" class="cad-round3-layout-panel" hidden aria-modal="true" role="dialog" aria-labelledby="cadRound3LayoutTitle">
        <form id="cadRound3LayoutForm">
          <header>
            <div><small>PRANCHA E PLOTAGEM</small><h2 id="cadRound3LayoutTitle">Configurar Layout técnico</h2></div>
            <button type="button" id="cadRound3LayoutClose" aria-label="Fechar">×</button>
          </header>
          <div class="cad-round3-layout-body">
            <p class="cad-round3-layout-intro">Defina o formato e a escala de impressão. O Model permanece em milímetros e a prancha é criada em Paper Space sem redimensionar a geometria.</p>
            <div class="cad-round3-layout-grid">
              <label>
                <span>Formato da folha</span>
                <select id="cadRound3PaperFormat">
                  <option value="A3">A3 — 420 × 297 mm</option>
                  <option value="A4">A4 — 297 × 210 mm</option>
                </select>
              </label>
              <label>
                <span>Escala de plotagem</span>
                <select id="cadRound3PaperScale">
                  <option value="AUTO">Automática — melhor enquadramento</option>
                  <option value="1">1:1</option>
                  <option value="2">1:2</option>
                  <option value="2.5">1:2,5</option>
                  <option value="5">1:5</option>
                  <option value="10">1:10</option>
                  <option value="20">1:20</option>
                  <option value="25">1:25</option>
                  <option value="50">1:50</option>
                  <option value="100">1:100</option>
                  <option value="CUSTOM">Personalizada…</option>
                </select>
              </label>
              <label id="cadRound3CustomScaleWrap" hidden>
                <span>Denominador personalizado</span>
                <div class="cad-round3-scale-input"><b>1 :</b><input id="cadRound3CustomScale" type="number" min="0.01" max="100000" step="0.01" inputmode="decimal" value="1"></div>
              </label>
            </div>

            <div class="cad-round3-sheet-preview" aria-live="polite">
              <div class="cad-round3-sheet-visual">
                <span id="cadRound3SheetFormat">A3</span>
                <strong id="cadRound3SheetScale">AUTO</strong>
                <small>PAISAGEM • mm</small>
              </div>
              <div class="cad-round3-sheet-summary">
                <span>Prancha</span><strong id="cadRound3SheetSize">420 × 297 mm</strong>
                <span>Escala</span><strong id="cadRound3SheetScaleText">Automática</strong>
                <span>Estado atual</span><strong id="cadRound3LayoutCurrent">Nenhuma prancha salva</strong>
              </div>
            </div>

            <div class="cad-round3-layout-note"><strong>PDF técnico:</strong> após gerar a prancha, o formato e a escala ficam salvos no desenho e serão reutilizados na exportação PDF com o carimbo correto.</div>
          </div>
          <footer>
            <button type="button" class="cad-round3-layout-secondary" id="cadRound3LayoutCancel">Cancelar</button>
            <button type="submit" class="cad-round3-layout-primary" id="cadRound3LayoutSubmit">Gerar e salvar prancha</button>
          </footer>
        </form>
      </section>
    `);
  }
}

function setLayoutTab(active) {
  document.querySelectorAll('[data-layout-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.layoutTab === active);
  });
}

const STANDARD_PLOT_SCALES = ['1', '2', '2.5', '5', '10', '20', '25', '50', '100'];

function closeLayoutPanel() {
  const panel = document.getElementById('cadRound3LayoutPanel');
  if (panel) panel.hidden = true;
}

function layoutScaleValue() {
  const select = document.getElementById('cadRound3PaperScale');
  if (!select) return 'AUTO';
  if (select.value !== 'CUSTOM') return select.value;
  const custom = Number(document.getElementById('cadRound3CustomScale')?.value || 0);
  if (!Number.isFinite(custom) || custom <= 0) throw new Error('Informe uma escala personalizada válida.');
  return String(custom);
}

function updateLayoutPreview(cadData = {}) {
  const format = String(document.getElementById('cadRound3PaperFormat')?.value || 'A3').toUpperCase();
  const scaleSelect = document.getElementById('cadRound3PaperScale');
  const customWrap = document.getElementById('cadRound3CustomScaleWrap');
  if (customWrap) customWrap.hidden = scaleSelect?.value !== 'CUSTOM';

  let scale = 'AUTO';
  try { scale = layoutScaleValue(); } catch (_error) { scale = 'CUSTOM'; }
  const dimensions = format === 'A4' ? '297 × 210 mm' : '420 × 297 mm';
  const scaleText = scale === 'AUTO' ? 'Automática' : (scale === 'CUSTOM' ? 'Personalizada' : `1:${String(scale).replace('.', ',')}`);

  const formatEl = document.getElementById('cadRound3SheetFormat');
  const scaleEl = document.getElementById('cadRound3SheetScale');
  const sizeEl = document.getElementById('cadRound3SheetSize');
  const scaleTextEl = document.getElementById('cadRound3SheetScaleText');
  const currentEl = document.getElementById('cadRound3LayoutCurrent');
  if (formatEl) formatEl.textContent = format;
  if (scaleEl) scaleEl.textContent = scale === 'AUTO' ? 'AUTO' : (scale === 'CUSTOM' ? '1:?' : `1:${scale}`);
  if (sizeEl) sizeEl.textContent = dimensions;
  if (scaleTextEl) scaleTextEl.textContent = scaleText;

  const current = cadData?.manufacturing?.paperLayout;
  if (currentEl) currentEl.textContent = current?.format && current?.scale
    ? `${current.format} • ${String(current.scale).replace('.', ',')}`
    : 'Nenhuma prancha salva';
}

function openLayoutPanel(cadData = {}, preferredFormat = '') {
  const panel = document.getElementById('cadRound3LayoutPanel');
  const format = document.getElementById('cadRound3PaperFormat');
  const scale = document.getElementById('cadRound3PaperScale');
  const custom = document.getElementById('cadRound3CustomScale');
  if (!panel || !format || !scale || !custom) return;

  const previous = cadData?.manufacturing?.paperLayout || {};
  const requestedFormat = String(preferredFormat || '').toUpperCase();
  format.value = ['A3', 'A4'].includes(requestedFormat)
    ? requestedFormat
    : (['A3', 'A4'].includes(String(previous.format || '').toUpperCase()) ? String(previous.format).toUpperCase() : 'A3');

  const denominator = Number(previous.denominator);
  const token = Number.isFinite(denominator) && denominator > 0 ? String(denominator) : 'AUTO';
  if (STANDARD_PLOT_SCALES.includes(token)) {
    scale.value = token;
  } else if (token !== 'AUTO') {
    scale.value = 'CUSTOM';
    custom.value = token;
  } else {
    scale.value = 'AUTO';
  }

  updateLayoutPreview(cadData);
  panel.hidden = false;
  format.focus();
}

function showAnalysis(data) {
  const panel = document.getElementById('cadRound3Analysis');
  const body = document.getElementById('cadRound3AnalysisBody');
  if (!panel || !body) return;
  const metrics = data?.metrics || {};
  const validation = data?.validation || {};
  const issues = Array.isArray(validation.issues) ? validation.issues : [];
  const part = metrics.part_type ? String(metrics.part_type).toUpperCase() : 'GEOMETRIA 2D';
  body.innerHTML = `
    <div class="cad-round3-score" data-score="${Number(validation.score || 0)}">
      <strong>${numberText(validation.score, '%', 0)}</strong><span>Validação</span>
    </div>
    <div class="cad-round3-metrics">
      <article><span>Tipo reconhecido</span><strong>${safe(part)}</strong></article>
      <article><span>Área útil</span><strong>${numberText(metrics.area_mm2, 'mm²')}</strong></article>
      <article><span>Perímetro</span><strong>${numberText(metrics.perimeter_mm, 'mm')}</strong></article>
      <article><span>Volume</span><strong>${numberText(metrics.volume_cm3, 'cm³')}</strong></article>
      <article><span>Massa estimada</span><strong>${numberText(metrics.estimated_mass_kg, 'kg', 3)}</strong></article>
      <article><span>Densidade</span><strong>${numberText(metrics.density_kg_m3, 'kg/m³', 0)}</strong></article>
      <article><span>Método</span><strong>${safe(metrics.mass_method || metrics.density_source || '—')}</strong></article>
      <article><span>Espessura</span><strong>${numberText(metrics.thickness_mm, 'mm')}</strong></article>
      <article><span>Comprimento total</span><strong>${numberText(metrics.total_length_mm, 'mm')}</strong></article>
      <article><span>Ø máximo</span><strong>${numberText(metrics.max_diameter_mm, 'mm')}</strong></article>
    </div>
    <section class="cad-round3-issues">
      <h3>Validação geométrica</h3>
      ${issues.length ? `<ul>${issues.slice(0, 12).map((item) => `<li data-severity="${safe(item.severity)}"><strong>${safe(item.code)}</strong> ${safe(item.message)}</li>`).join('')}</ul>` : '<p>Sem inconsistências geométricas relevantes.</p>'}
    </section>
  `;
  panel.hidden = false;
}

function showAnalysisError(message) {
  const panel = document.getElementById('cadRound3Analysis');
  const body = document.getElementById('cadRound3AnalysisBody');
  if (!panel || !body) return;
  body.innerHTML = `<div class="cad-round3-analysis-error"><strong>Análise indisponível</strong><p>${safe(message)}</p><small>O editor continua funcionando normalmente. Verifique o serviço CAD Python no Railway.</small></div>`;
  panel.hidden = false;
}

async function persistCurrent(drawingId, cadData) {
  const app = window.CAD_MLIGHT_APP;
  if (!app?.serializeForSave) throw new Error('Editor ainda não está pronto para salvar.');
  const payload = app.serializeForSave(cadData);
  if (cadData.manufacturing) payload.manufacturing = cadData.manufacturing;
  const snapshot = [...(Array.isArray(payload.history) ? payload.history : [])].reverse()
    .find((item) => item && typeof item === 'object' && item.kind === 'mlightcad-document');
  if (String(snapshot?.dxfBase64 || '').length > 1_500_000) throw new Error('Desenho muito grande para análise integrada; salve/exporte o DXF antes.');
  const response = await fetch(`/desenho-tecnico/cad/${drawingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || `HTTP ${response.status}`);
  Object.assign(cadData, payload);
  const saveState = document.getElementById('mlightSaveState');
  if (saveState) {
    saveState.textContent = 'Tudo salvo';
    saveState.dataset.state = 'saved';
  }
  return payload;
}

async function checkPython(drawingId) {
  const badge = document.getElementById('mlightPythonBadge');
  const button = document.getElementById('mlightTechAnalysisBtn');
  try {
    const response = await fetch(`/desenho-tecnico/cad/${drawingId}/python/status`, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    const online = Boolean(response.ok && data.ok && data.available !== false);
    if (badge) {
      badge.textContent = online ? 'MOTOR TÉCNICO • AVANÇADO ✓' : 'MOTOR TÉCNICO • BÁSICO';
      badge.dataset.state = online ? 'online' : 'offline';
      badge.title = online ? 'CAD Python Engine disponível' : (data.error || 'CAD Python Engine não configurado');
    }
    if (button) button.dataset.pythonOnline = online ? '1' : '0';
    return online;
  } catch (_error) {
    if (badge) {
      badge.textContent = 'MOTOR TÉCNICO • BÁSICO';
      badge.dataset.state = 'offline';
    }
    if (button) button.dataset.pythonOnline = '0';
    return false;
  }
}

async function initRound3() {
  if (window.CAD_ROUND3_READY || !window.CAD_MLIGHT_READY) return;
  window.CAD_ROUND3_READY = true;
  ensureRound3Styles();
  injectRound3Ui();

  const drawingId = Number(window.CAD_INITIAL?.desenhoId || 0);
  const cadData = window.CAD_INITIAL?.data || {};
  const layoutModule = await import('/vendor/mlightcad/mlightcad-layout-analysis.js');
  const layouts = layoutModule.createMlightLayoutTools({
    cadData,
    onStatus: (message) => setCadStatus(message, 'ok')
  });
  window.CAD_MLIGHT_LAYOUTS = layouts;

  const runChange = async (action) => {
    try {
      const result = await action();
      if (result !== false && result?.count !== 0 && result?.persisted !== true) setSaveDirty();
      return result;
    } catch (error) {
      console.error('[CAD][ROUND3]', error);
      setCadStatus(`Falha: ${error.message || error}`, 'error');
      return false;
    }
  };

  document.getElementById('mlightProjectedViewsBtn')?.addEventListener('click', () => runChange(async () => {
    layouts.switchModel();
    setLayoutTab('Model');
    return layouts.generateProjectedViews();
  }));

  document.getElementById('mlightPaperLayoutBtn')?.addEventListener('click', () => openLayoutPanel(cadData));

  document.getElementById('cadRound3PaperFormat')?.addEventListener('change', () => updateLayoutPreview(cadData));
  document.getElementById('cadRound3PaperScale')?.addEventListener('change', () => updateLayoutPreview(cadData));
  document.getElementById('cadRound3CustomScale')?.addEventListener('input', () => updateLayoutPreview(cadData));
  document.getElementById('cadRound3LayoutClose')?.addEventListener('click', closeLayoutPanel);
  document.getElementById('cadRound3LayoutCancel')?.addEventListener('click', closeLayoutPanel);

  document.getElementById('cadRound3LayoutForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = document.getElementById('cadRound3LayoutSubmit');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Gerando prancha…';
    }
    try {
      await runChange(async () => {
        const format = String(document.getElementById('cadRound3PaperFormat')?.value || 'A3').toUpperCase();
        if (!['A3', 'A4'].includes(format)) throw new Error('Formato de prancha inválido.');
        const scale = layoutScaleValue();
        const result = layouts.createPaperLayout({ format, scale });
        setLayoutTab(format);
        await persistCurrent(drawingId, cadData);
        updateLayoutPreview(cadData);
        closeLayoutPanel();
        setCadStatus(`Prancha ${format} gerada e salva em ${result?.manufacturing?.paperLayout?.scale || 'escala automática'}.`, 'ok');
        return { ...(result || {}), persisted: true };
      });
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Gerar e salvar prancha';
      }
    }
  });

  document.querySelectorAll('[data-layout-tab]').forEach((button) => button.addEventListener('click', () => {
    const target = button.dataset.layoutTab;
    if (target !== 'Model' && !layouts.hasLayout(target)) {
      openLayoutPanel(cadData, target);
      return;
    }
    const ok = target === 'Model' ? layouts.switchModel() : (target === 'A4' ? layouts.switchA4() : layouts.switchA3());
    if (ok) setLayoutTab(target);
  }));

  document.getElementById('mlightTechAnalysisBtn')?.addEventListener('click', async () => {
    const panel = document.getElementById('cadRound3Analysis');
    const body = document.getElementById('cadRound3AnalysisBody');
    if (panel && body) {
      body.innerHTML = '<p class="cad-round3-loading">Salvando desenho e executando análise técnica…</p>';
      panel.hidden = false;
    }
    try {
      const online = await checkPython(drawingId);
      if (!online) return showAnalysisError('O CAD Python Engine está offline ou ainda não foi configurado.');
      await persistCurrent(drawingId, cadData);
      const previousThickness = cadData.manufacturing?.analysisThickness || '';
      const rawThickness = prompt('Espessura para chapa/desenho genérico em mm (0 = detectar automaticamente quando possível):', previousThickness || '0');
      if (rawThickness === null) return;
      const thickness = Math.max(0, Number(rawThickness) || 0);
      cadData.manufacturing = { ...(cadData.manufacturing || {}), analysisThickness: thickness || null };
      const response = await fetch(`/desenho-tecnico/cad/${drawingId}/analisar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ thickness_mm: thickness || null })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || `HTTP ${response.status}`);
      showAnalysis(result.data || {});
      setCadStatus('Análise técnica concluída: área, volume, massa e validação atualizados.', 'ok');
    } catch (error) {
      console.error('[CAD][ROUND3][ANALYSIS]', error);
      showAnalysisError(error.message || error);
      setCadStatus(`Falha na análise técnica: ${error.message || error}`, 'error');
    }
  });

  document.getElementById('cadRound3AnalysisClose')?.addEventListener('click', () => {
    const panel = document.getElementById('cadRound3Analysis');
    if (panel) panel.hidden = true;
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const analysisPanel = document.getElementById('cadRound3Analysis');
      if (analysisPanel && !analysisPanel.hidden) analysisPanel.hidden = true;
      closeLayoutPanel();
    }
  });

  await checkPython(drawingId);
}

if (window.CAD_MLIGHT_READY) {
  await initRound3();
} else {
  window.addEventListener('cad:mlight-ready', () => initRound3(), { once: true });
}
