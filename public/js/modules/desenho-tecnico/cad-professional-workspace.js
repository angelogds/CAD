import { buildFeatureTreeModel, isUsefulViewport } from './professional-workspace.logic.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

function installRuntimeDiagnostics() {
  if (window.__cadRuntimeDiagnosticsInstalled) return;
  window.__cadRuntimeDiagnosticsInstalled = true;
  const report = (kind, message, source = '') => {
    const status = document.getElementById('cadStatusMessage');
    const safe = String(message || 'erro não identificado').replace(/^Uncaught\s*/i, '').slice(0, 120);
    const file = String(source || '').split('/').pop();
    if (status) {
      status.dataset.runtimeDiagnostic = '1';
      status.textContent = `CAD ativo • ${kind}: ${safe}${file ? ` (${file})` : ''}`;
    }
  };
  window.addEventListener('error', (event) => {
    console.error('[CAD][RUNTIME]', event.error || event.message || event);
    report('recurso auxiliar com erro', event.message, event.filename);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || event.reason || 'falha assíncrona';
    console.error('[CAD][PROMISE]', event.reason || event);
    report('falha assíncrona', reason);
  });
}

installRuntimeDiagnostics();

function ensureProfessionalStyles() {
  if (document.querySelector('link[data-cad-professional-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/cad-professional-final.css?v=20260820-v1';
  link.dataset.cadProfessionalStyle = '1';
  document.head.appendChild(link);
}

function normalizeRibbonGroups() {
  const ribbon = document.querySelector('.cad-ribbon');
  if (!ribbon) return;
  const mapping = [
    ['.cad-ribbon-featured', 'home'],
    ['.cad-ribbon-home-quick', 'home'],
    ['.cad-ribbon-selection', 'modify'],
    ['.cad-ribbon-annotation', 'annotate'],
    ['.cad-ribbon-hatch-final', 'draw'],
    ['.cad-ribbon-array-final', 'modify'],
    ['.cad-ribbon-layer-manager', 'layers'],
    ['.cad-ribbon-precision', 'view'],
    ['.cad-ribbon-display-mode', 'view'],
  ];
  mapping.forEach(([selector, tabs]) => {
    const group = ribbon.querySelector(selector);
    if (group) group.dataset.cadTabs = tabs;
  });
  const draw = Array.from(ribbon.querySelectorAll(':scope > .cad-ribbon-group')).find((group) => group.querySelector('[data-action="tool-line"]') && !group.classList.contains('cad-ribbon-home-quick'));
  const modify = Array.from(ribbon.querySelectorAll(':scope > .cad-ribbon-group')).find((group) => group.querySelector('[data-action="tool-move"]') && !group.classList.contains('cad-ribbon-home-quick'));
  if (draw) draw.dataset.cadTabs = 'draw';
  if (modify) modify.dataset.cadTabs = 'modify';

  const active = ribbon.dataset.activeCadTab || 'home';
  ribbon.querySelectorAll(':scope > .cad-ribbon-group').forEach((group) => {
    const tabs = String(group.dataset.cadTabs || 'home').split(/\s+/).filter(Boolean);
    group.hidden = !tabs.includes(active);
  });
}

function installRibbonNormalizer() {
  const ribbon = document.querySelector('.cad-ribbon');
  if (!ribbon || ribbon.__professionalObserver) return;
  const observer = new MutationObserver(() => normalizeRibbonGroups());
  observer.observe(ribbon, { childList: true });
  ribbon.__professionalObserver = observer;
  setTimeout(normalizeRibbonGroups, 0);
}

function installPointGrid(cad) {
  const renderer = cad?.renderer;
  if (!renderer?.layers?.grid || renderer.__pointGridInstalled) return;
  renderer.__pointGridInstalled = true;
  renderer.renderGrid = () => {
    const layer = renderer.layers.grid;
    layer.innerHTML = '';
    if (!cad.state.gridConfig.visible) return;
    const view = cad.viewport.getViewState();
    const zoom = Math.max(0.0001, Number(view.zoom || 1));
    const baseStep = Math.max(0.001, Number(cad.state.gridConfig.step || 20));
    const targetPx = 30;
    const power = Math.pow(2, Math.round(Math.log2(targetPx / Math.max(1, baseStep * zoom))));
    let step = Math.max(baseStep / 16, baseStep * power);
    const min = cad.viewport.screenToWorld(0, 0);
    const max = cad.viewport.screenToWorld(view.width, view.height);
    let cols = Math.ceil(Math.abs(max.x - min.x) / step) + 2;
    let rows = Math.ceil(Math.abs(max.y - min.y) / step) + 2;
    if (cols * rows > 2600) {
      const factor = Math.ceil(Math.sqrt((cols * rows) / 2600));
      step *= factor;
      cols = Math.ceil(Math.abs(max.x - min.x) / step) + 2;
      rows = Math.ceil(Math.abs(max.y - min.y) / step) + 2;
    }
    const startX = Math.floor(Math.min(min.x, max.x) / step) * step;
    const endX = Math.ceil(Math.max(min.x, max.x) / step) * step;
    const startY = Math.floor(Math.min(min.y, max.y) / step) * step;
    const endY = Math.ceil(Math.max(min.y, max.y) / step) * step;
    const majorEvery = 5;
    let ix = 0;
    for (let x = startX; x <= endX + step * 0.25; x += step, ix += 1) {
      let iy = 0;
      for (let y = startY; y <= endY + step * 0.25; y += step, iy += 1) {
        const p = cad.viewport.worldToScreen(x, y);
        const major = ix % majorEvery === 0 && iy % majorEvery === 0;
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', p.x.toFixed(2));
        dot.setAttribute('cy', p.y.toFixed(2));
        dot.setAttribute('r', major ? '1.15' : '.62');
        dot.setAttribute('fill', major ? 'var(--cad-grid-major)' : 'var(--cad-grid-minor)');
        layer.appendChild(dot);
      }
    }
    const origin = cad.viewport.worldToScreen(0, 0);
    const xAxis = document.createElementNS(SVG_NS, 'line');
    xAxis.setAttribute('x1', '0'); xAxis.setAttribute('y1', origin.y.toFixed(2)); xAxis.setAttribute('x2', String(view.width)); xAxis.setAttribute('y2', origin.y.toFixed(2));
    xAxis.setAttribute('class', 'cad-origin-axis cad-origin-axis-x');
    layer.appendChild(xAxis);
    const yAxis = document.createElementNS(SVG_NS, 'line');
    yAxis.setAttribute('x1', origin.x.toFixed(2)); yAxis.setAttribute('y1', '0'); yAxis.setAttribute('x2', origin.x.toFixed(2)); yAxis.setAttribute('y2', String(view.height));
    yAxis.setAttribute('class', 'cad-origin-axis cad-origin-axis-y');
    layer.appendChild(yAxis);
  };
}

function updateProfessionalDisplayButtons(mode) {
  document.querySelectorAll('[data-action="display-wireframe"],[data-action="display-hatch"],[data-action="display-solid"]').forEach((button) => {
    const expected = button.dataset.action === 'display-solid' ? 'solid' : button.dataset.action === 'display-hatch' ? 'hatch' : 'wireframe';
    const active = expected === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function installThreeDisplayModes(cad) {
  if (!cad || cad.__professionalDisplayInstalled) return;
  cad.__professionalDisplayInstalled = true;
  const shell = document.querySelector('.cad-fullscreen');
  const group = document.querySelector('.cad-ribbon-display-mode');
  const statusSwitch = document.querySelector('.cad-display-status-switch');
  if (!shell) return;

  if (group && !group.querySelector('[data-action="display-hatch"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cad-ribbon-btn';
    button.dataset.action = 'display-hatch';
    button.title = 'Exibir contornos com hachuras';
    button.innerHTML = '<span class="cad-ribbon-icon" aria-hidden="true">▧</span><span>Hachura</span>';
    const solid = group.querySelector('[data-action="display-solid"]');
    group.insertBefore(button, solid || null);
  }
  if (statusSwitch && !statusSwitch.querySelector('[data-action="display-hatch"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = 'display-hatch';
    button.textContent = 'HACHURA';
    const solid = statusSwitch.querySelector('[data-action="display-solid"]');
    statusSwitch.insertBefore(button, solid || null);
  }

  const saved = window.localStorage?.getItem?.('cad2d.displayMode');
  if (saved === 'hatch') shell.dataset.displayMode = 'hatch';

  const priorRender = cad.render.bind(cad);
  cad.render = (...args) => {
    const mode = shell.dataset.displayMode || 'wireframe';
    const temporarilyHidden = [];
    if (mode === 'wireframe') {
      (cad.state.entities || []).forEach((entity) => {
        if (entity.visible !== false && String(entity.metadata?.primitive || '').toLowerCase() === 'hatch') {
          temporarilyHidden.push(entity);
          entity.visible = false;
        }
      });
    }
    let result;
    try {
      result = priorRender(...args);
    } finally {
      temporarilyHidden.forEach((entity) => { entity.visible = true; });
    }
    updateProfessionalDisplayButtons(mode);
    return result;
  };

  const priorAction = cad.executeAction.bind(cad);
  cad.executeAction = (action, source) => {
    if (['display-wireframe', 'display-hatch', 'display-solid'].includes(action)) {
      const mode = action === 'display-solid' ? 'solid' : action === 'display-hatch' ? 'hatch' : 'wireframe';
      shell.dataset.displayMode = mode;
      window.localStorage?.setItem?.('cad2d.displayMode', mode);
      cad.state.statusMessage = mode === 'solid' ? 'Visualização Sólido 2D.' : mode === 'hatch' ? 'Visualização com hachuras.' : 'Visualização Arame / contornos.';
      cad.render();
      return;
    }
    return priorAction(action, source);
  };
}

function createFeatureTree(left) {
  let tree = left.querySelector('.cad-feature-tree');
  if (tree) return tree;
  tree = document.createElement('div');
  tree.className = 'cad-feature-tree';
  const summary = left.querySelector('.cad-feature-summary');
  if (summary) summary.insertAdjacentElement('afterend', tree);
  else left.appendChild(tree);
  return tree;
}

function updateFeatureTree(cad) {
  const left = document.querySelector('.cad-panel-left');
  if (!left) return;
  left.classList.add('cad-feature-tree-mode');
  const tree = createFeatureTree(left);
  const groups = buildFeatureTreeModel(cad.state.entities || [], cad.state.layers || {}, cad.state.activeLayer);
  const selected = new Set(Array.from(cad.selection?.ids || []).map(String));
  tree.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'cad-feature-root';
  root.innerHTML = `<span>📄</span><div><strong>${cad.state.metadata?.codigo || 'DESENHO'}</strong><small>${cad.state.metadata?.titulo || 'Modelo 2D'}</small></div>`;
  tree.appendChild(root);

  const plane = document.createElement('div');
  plane.className = 'cad-feature-plane';
  plane.innerHTML = '<span>📐</span><div><strong>Plano principal</strong><small>Vista 2D • unidade mm</small></div>';
  tree.appendChild(plane);

  groups.forEach((group) => {
    const details = document.createElement('details');
    details.className = 'cad-feature-layer';
    details.open = group.active || group.entities.some((entity) => selected.has(entity.id));
    const summary = document.createElement('summary');
    summary.innerHTML = `<span>▤</span><strong>${group.name}</strong><small>${group.entities.length}</small>`;
    summary.addEventListener('click', () => { cad.state.activeLayer = group.name; });
    details.appendChild(summary);
    const list = document.createElement('div');
    list.className = 'cad-feature-entities';
    group.entities.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cad-feature-entity${selected.has(item.id) ? ' active' : ''}${item.visible ? '' : ' muted'}`;
      button.dataset.cadTreeEntity = item.id;
      button.innerHTML = `<span class="cad-feature-entity-icon">${item.icon}</span><span>${item.label}</span>`;
      button.addEventListener('click', () => {
        const entity = (cad.state.entities || []).find((candidate) => String(candidate.id) === item.id);
        if (!entity) return;
        cad.state.activeLayer = entity.metadata?.layer || cad.state.activeLayer;
        cad.selection.set([entity.id]);
        document.getElementById('cadProperties')?.closest('details')?.setAttribute('open', '');
        cad.render();
      });
      list.appendChild(button);
    });
    if (!group.entities.length) {
      const empty = document.createElement('span');
      empty.className = 'cad-feature-empty';
      empty.textContent = 'Camada ativa sem objetos';
      list.appendChild(empty);
    }
    details.appendChild(list);
    tree.appendChild(details);
  });
}

function installFeatureTree(cad) {
  if (!cad || cad.__professionalTreeInstalled) return;
  cad.__professionalTreeInstalled = true;
  const priorRender = cad.render.bind(cad);
  cad.render = (...args) => {
    const result = priorRender(...args);
    updateFeatureTree(cad);
    return result;
  };
}

function installCanvasWidgets(cad) {
  const container = document.querySelector('.cad-canvas-container');
  const shell = document.querySelector('.cad-fullscreen');
  if (!container || !shell || container.querySelector('.cad-ucs-widget')) return;

  const ucs = document.createElement('div');
  ucs.className = 'cad-ucs-widget';
  ucs.innerHTML = '<span class="cad-ucs-origin"></span><span class="cad-ucs-x">X</span><span class="cad-ucs-y">Y</span>';
  container.appendChild(ucs);

  const view = document.createElement('button');
  view.type = 'button';
  view.className = 'cad-top-view-widget';
  view.title = 'Vista superior / enquadrar desenho';
  view.innerHTML = '<strong>TOP</strong><span>2D</span>';
  view.addEventListener('click', () => cad.executeAction('zoom-extents'));
  container.appendChild(view);

  const frame = document.createElement('div');
  frame.className = 'cad-sheet-frame';
  frame.setAttribute('aria-hidden', 'true');
  container.appendChild(frame);

  const tabs = document.createElement('div');
  tabs.className = 'cad-layout-tabs';
  tabs.innerHTML = '<button type="button" data-sheet-mode="model" class="active">MODEL</button><button type="button" data-sheet-mode="a4">LAYOUT A4</button><button type="button" data-sheet-mode="a3">LAYOUT A3</button>';
  container.appendChild(tabs);
  shell.dataset.sheetMode = 'model';
  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sheet-mode]');
    if (!button) return;
    const mode = button.dataset.sheetMode;
    shell.dataset.sheetMode = mode;
    tabs.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
    frame.dataset.paper = mode.toUpperCase();
    cad.state.statusMessage = mode === 'model' ? 'MODEL • desenho em escala real.' : `${mode.toUpperCase()} • pré-visualização da folha técnica; o modelo não é alterado.`;
    cad.render();
  });
}

function ensureDrawingVisible(cad) {
  const check = () => {
    const bounds = cad?.renderer?.getGlobalBounds?.();
    if (!bounds?.isValid?.()) return;
    cad.viewport.resize();
    const view = cad.viewport.getViewState();
    if (isUsefulViewport(view, bounds, { margin: 72, minPixelSpan: 28 })) return;
    cad.viewport.zoomExtents(bounds);
    cad.state.statusMessage = 'Desenho enquadrado automaticamente: viewport salvo estava fora da geometria.';
    cad.render();
  };
  requestAnimationFrame(() => requestAnimationFrame(check));
}

export function installCadProfessionalWorkspace(cad) {
  if (!cad || cad.__professionalWorkspaceInstalled) return;
  cad.__professionalWorkspaceInstalled = true;
  ensureProfessionalStyles();
  installPointGrid(cad);
  installThreeDisplayModes(cad);
  installFeatureTree(cad);
  installCanvasWidgets(cad);
  installRibbonNormalizer();
  ensureDrawingVisible(cad);
  cad.render();
}
