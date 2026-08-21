function ensureRound3Styles() {
  if (document.querySelector('link[data-cad-round3-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/cad-round3.css?v=20260821-layout-python-v1';
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
    `);
  }
}

function setLayoutTab(active) {
  document.querySelectorAll('[data-layout-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.layoutTab === active);
  });
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
      if (result !== false && result?.count !== 0) setSaveDirty();
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

  document.getElementById('mlightPaperLayoutBtn')?.addEventListener('click', () => runChange(async () => {
    const previous = cadData.manufacturing?.paperLayout || {};
    const format = String(prompt('Formato do Layout (A3 ou A4):', previous.format || 'A3') || '').trim().toUpperCase();
    if (!['A3', 'A4'].includes(format)) throw new Error('Informe A3 ou A4.');
    const scale = String(prompt('Escala: AUTO, 1, 2, 2.5, 5, 10, 20, 25, 50 ou 100 (1:n):', previous.denominator || 'AUTO') || 'AUTO').trim();
    const result = layouts.createPaperLayout({ format, scale });
    setLayoutTab(format);
    return result;
  }));

  document.querySelectorAll('[data-layout-tab]').forEach((button) => button.addEventListener('click', () => {
    const target = button.dataset.layoutTab;
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
      const panel = document.getElementById('cadRound3Analysis');
      if (panel && !panel.hidden) panel.hidden = true;
    }
  });

  await checkPython(drawingId);
}

if (window.CAD_MLIGHT_READY) {
  await initRound3();
} else {
  window.addEventListener('cad:mlight-ready', () => initRound3(), { once: true });
}
