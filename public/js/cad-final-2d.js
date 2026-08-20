import {
  EllipseTool,
  SplineTool,
  HatchTool,
  ScaleTool,
  StretchTool,
  BreakTool,
  JoinTool,
  ExplodeTool,
  RectangularArrayTool,
  PolarArrayTool,
} from './modules/desenho-tecnico/tools/final-2d.tools.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function button({ action, tool, icon, label, title, className = '' }) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `cad-ribbon-btn${className ? ` ${className}` : ''}`;
  el.dataset.action = action;
  if (tool) el.dataset.tool = tool;
  el.title = title || label;
  el.setAttribute('aria-label', label);
  el.innerHTML = `<span class="cad-ribbon-icon" aria-hidden="true">${icon}</span><span>${label}</span>`;
  return el;
}

function sideButton(config) {
  const el = button(config);
  el.className = 'cad-tool-btn';
  el.dataset.tooltip = config.title || config.label;
  el.innerHTML = `<span class="cad-tool-icon" aria-hidden="true">${config.icon}</span><span>${config.label}</span>`;
  return el;
}

function addGroup(ribbon, className, label, items, before = null) {
  const existing = ribbon.querySelector(`.${className}`);
  if (existing) return existing;
  const group = document.createElement('div');
  group.className = `cad-ribbon-group ${className}`;
  group.innerHTML = `<span class="cad-ribbon-label">${label}</span>`;
  items.forEach((item) => group.appendChild(button(item)));
  if (before) ribbon.insertBefore(group, before); else ribbon.appendChild(group);
  return group;
}

function ensureStyleSheet() {
  const existing = document.querySelector('link[data-cad-final2d-style]');
  if (existing) {
    existing.href = '/css/cad-solidworks-workbench.css?v=20260819-technical-v2';
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/cad-solidworks-workbench.css?v=20260819-technical-v2';
  link.dataset.cadFinal2dStyle = '1';
  document.head.appendChild(link);
}

function installTechnicalShell(cad) {
  ensureStyleSheet();
  const shell = document.querySelector('.cad-fullscreen');
  if (!shell) return;

  shell.classList.add('cad-solidworks-shell', 'cad-technical-shell', 'cad-theme-dark');
  shell.classList.remove('cad-theme-light');
  shell.dataset.displayMode = 'wireframe';
  document.body.classList.add('cad-solidworks-mode', 'cad-technical-mode');

  const brand = document.querySelector('.cad-brand-mark');
  if (brand) brand.textContent = '2D';

  const appbar = document.querySelector('.cad-appbar');
  if (appbar && !appbar.querySelector('.cad-workbench-badge')) {
    const heading = appbar.querySelector('.cad-document-heading');
    const badge = document.createElement('span');
    badge.className = 'cad-workbench-badge';
    badge.textContent = 'DESENHO MECÂNICO • CAD 2D';
    heading?.prepend(badge);
  } else if (appbar?.querySelector('.cad-workbench-badge')) {
    appbar.querySelector('.cad-workbench-badge').textContent = 'DESENHO MECÂNICO • CAD 2D';
  }

  const left = document.querySelector('.cad-panel-left');
  if (left && !left.querySelector('.cad-feature-manager-head')) {
    const head = document.createElement('div');
    head.className = 'cad-feature-manager-head';
    head.innerHTML = '<strong>FeatureManager</strong><span>Árvore e ferramentas do desenho</span>';
    left.prepend(head);
  } else if (left?.querySelector('.cad-feature-manager-head span')) {
    left.querySelector('.cad-feature-manager-head span').textContent = 'Árvore e ferramentas do desenho';
  }

  const rightHead = document.querySelector('.cad-inspector-head strong');
  if (rightHead) rightHead.textContent = 'PropertyManager';

  cad.render?.();
}

function installFinalTools(cad) {
  if (!cad?.toolManager || !cad?.ctx || cad.__final2dToolsInstalled) return;
  cad.__final2dToolsInstalled = true;
  [
    new EllipseTool(cad.ctx), new SplineTool(cad.ctx), new HatchTool(cad.ctx), new ScaleTool(cad.ctx), new StretchTool(cad.ctx),
    new BreakTool(cad.ctx), new JoinTool(cad.ctx), new ExplodeTool(cad.ctx), new RectangularArrayTool(cad.ctx), new PolarArrayTool(cad.ctx),
  ].forEach((tool) => cad.toolManager.register(tool));

  const labels = {
    ellipse: 'Elipse', spline: 'Spline', hatch: 'Hachura', scale: 'Escala', stretch: 'Stretch', break: 'Break', join: 'Join', explode: 'Explode', array_rect: 'Array retangular', array_polar: 'Array circular',
  };
  const priorLabel = cad.getToolLabel.bind(cad);
  cad.getToolLabel = (name) => labels[name] || priorLabel(name);

  const aliases = {
    el: 'tool-ellipse', ellipse: 'tool-ellipse', elipse: 'tool-ellipse',
    spl: 'tool-spline', spline: 'tool-spline',
    h: 'tool-hatch', bh: 'tool-hatch', hatch: 'tool-hatch', hachura: 'tool-hatch',
    sc: 'tool-scale', scale: 'tool-scale', escala: 'tool-scale',
    st: 'tool-stretch', stretch: 'tool-stretch', esticar: 'tool-stretch',
    br: 'tool-break', break: 'tool-break', quebrar: 'tool-break',
    j: 'tool-join', join: 'tool-join', unir: 'tool-join',
    xp: 'tool-explode', explode: 'tool-explode', explodir: 'tool-explode',
    ar: 'tool-array-rect', arrayrect: 'tool-array-rect', matriz: 'tool-array-rect',
    ap: 'tool-array-polar', arraypolar: 'tool-array-polar', matrizpolar: 'tool-array-polar',
  };
  const priorCommand = cad.executeCommand.bind(cad);
  cad.executeCommand = (raw) => {
    const command = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
    const action = aliases[command];
    if (!action) return priorCommand(raw);
    cad.lastCommand = command;
    const tool = action.slice(5).replace('array-rect', 'array_rect').replace('array-polar', 'array_polar');
    cad.executeAction(action, { dataset: { tool } });
    return true;
  };

  const priorAction = cad.executeAction.bind(cad);
  cad.executeAction = (action, source) => {
    const map = {
      'tool-ellipse': 'ellipse', 'tool-spline': 'spline', 'tool-hatch': 'hatch', 'tool-scale': 'scale', 'tool-stretch': 'stretch',
      'tool-break': 'break', 'tool-join': 'join', 'tool-explode': 'explode', 'tool-array-rect': 'array_rect', 'tool-array-polar': 'array_polar',
    };
    if (!map[action]) return priorAction(action, source);
    cad.toolManager.set(map[action]);
    cad.eventBus.emit('tool:changed', map[action]);
    cad.render();
  };
}

function installFinalRibbon() {
  const ribbon = document.querySelector('.cad-ribbon');
  if (!ribbon) return;
  const precision = ribbon.querySelector('.cad-ribbon-precision');
  const draw = Array.from(ribbon.querySelectorAll('.cad-ribbon-group')).find((group) => group.textContent.includes('Desenhar'));
  const modify = Array.from(ribbon.querySelectorAll('.cad-ribbon-group')).find((group) => group.textContent.includes('Modificar'));

  [
    { action: 'tool-ellipse', tool: 'ellipse', icon: '⬭', label: 'Elipse', title: 'Elipse por centro e eixos (EL)' },
    { action: 'tool-spline', tool: 'spline', icon: '∿', label: 'Spline', title: 'Spline por pontos de controle (SPL)' },
  ].forEach((config) => { if (draw && !draw.querySelector(`[data-action="${config.action}"]`)) draw.appendChild(button(config)); });

  [
    { action: 'tool-scale', tool: 'scale', icon: '⤢', label: 'Escala', title: 'Escalar seleção (SC)' },
    { action: 'tool-stretch', tool: 'stretch', icon: '↔', label: 'Stretch', title: 'Esticar por grip (ST)' },
    { action: 'tool-break', tool: 'break', icon: '⌇', label: 'Break', title: 'Remover trecho de linha (BR)' },
    { action: 'tool-join', tool: 'join', icon: '⛓', label: 'Join', title: 'Unir linhas conectadas (J)' },
    { action: 'tool-explode', tool: 'explode', icon: '✣', label: 'Explode', title: 'Explodir polilinha/retângulo (XP)' },
  ].forEach((config) => { if (modify && !modify.querySelector(`[data-action="${config.action}"]`)) modify.appendChild(button(config)); });

  addGroup(ribbon, 'cad-ribbon-hatch-final', 'Hachura', [
    { action: 'tool-hatch', tool: 'hatch', icon: '▧', label: 'Hachura', title: 'Hachura ANSI31/CROSS/SOLID (H)' },
  ], precision);
  addGroup(ribbon, 'cad-ribbon-array-final', 'Padrões', [
    { action: 'tool-array-rect', tool: 'array_rect', icon: '▦', label: 'Retangular', title: 'Array retangular (AR)' },
    { action: 'tool-array-polar', tool: 'array_polar', icon: '◉', label: 'Circular', title: 'Array circular/polar (AP)' },
  ], precision);

  const left = document.querySelector('.cad-panel-left');
  if (left && !left.querySelector('.cad-tool-group-final2d')) {
    const group = document.createElement('div');
    group.className = 'cad-tool-group cad-tool-group-final2d';
    group.innerHTML = '<span class="cad-tool-group-label">CAD 2D avançado</span>';
    [
      { action: 'tool-ellipse', tool: 'ellipse', icon: '⬭', label: 'Elipse' }, { action: 'tool-spline', tool: 'spline', icon: '∿', label: 'Spline' },
      { action: 'tool-hatch', tool: 'hatch', icon: '▧', label: 'Hachura' }, { action: 'tool-scale', tool: 'scale', icon: '⤢', label: 'Escala' },
      { action: 'tool-stretch', tool: 'stretch', icon: '↔', label: 'Stretch' }, { action: 'tool-break', tool: 'break', icon: '⌇', label: 'Break' },
      { action: 'tool-join', tool: 'join', icon: '⛓', label: 'Join' }, { action: 'tool-explode', tool: 'explode', icon: '✣', label: 'Explode' },
      { action: 'tool-array-rect', tool: 'array_rect', icon: '▦', label: 'Array ret.' }, { action: 'tool-array-polar', tool: 'array_polar', icon: '◉', label: 'Array circ.' },
    ].forEach((config) => group.appendChild(sideButton(config)));
    left.appendChild(group);
  }

  const command = document.getElementById('cadCommandInput');
  if (command) command.placeholder = 'Comando: L, PL, C, EL, SPL, H, M, RO, FI, CHA, SC, ST, BR, J, XP, AR, AP...';
}

function createTabButton(id, label) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cad-command-tab';
  el.dataset.cadTab = id;
  el.setAttribute('role', 'tab');
  el.textContent = label;
  return el;
}

function activateCadTab(ribbon, tabs, active) {
  tabs.querySelectorAll('.cad-command-tab').forEach((tab) => {
    const selected = tab.dataset.cadTab === active;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  ribbon.querySelectorAll(':scope > .cad-ribbon-group').forEach((group) => {
    const assigned = String(group.dataset.cadTabs || 'home').split(/\s+/).filter(Boolean);
    group.hidden = !assigned.includes(active);
  });
  ribbon.dataset.activeCadTab = active;
}

function installCommandManagerTabs(cad) {
  const ribbon = document.querySelector('.cad-ribbon');
  const toolbar = document.querySelector('.cad-toolbar');
  if (!ribbon || !toolbar || toolbar.querySelector('.cad-command-tabs')) return;

  const featured = ribbon.querySelector('.cad-ribbon-featured');
  const draw = Array.from(ribbon.querySelectorAll(':scope > .cad-ribbon-group')).find((group) => group.textContent.includes('Desenhar'));
  const modify = Array.from(ribbon.querySelectorAll(':scope > .cad-ribbon-group')).find((group) => group.textContent.includes('Modificar'));
  const selection = ribbon.querySelector('.cad-ribbon-selection');
  const annotation = ribbon.querySelector('.cad-ribbon-annotation');
  const precision = ribbon.querySelector('.cad-ribbon-precision');
  const hatch = ribbon.querySelector('.cad-ribbon-hatch-final');
  const arrays = ribbon.querySelector('.cad-ribbon-array-final');

  const homeQuick = addGroup(ribbon, 'cad-ribbon-home-quick', 'Acesso rápido', [
    { action: 'tool-line', tool: 'line', icon: '╱', label: 'Linha', title: 'Linha (L)' },
    { action: 'tool-polyline', tool: 'polyline', icon: '⌁', label: 'Polilinha', title: 'Polilinha (PL)' },
    { action: 'tool-circle', tool: 'circle', icon: '○', label: 'Círculo', title: 'Círculo (C)' },
    { action: 'tool-move', tool: 'move', icon: '✥', label: 'Mover', title: 'Mover (M)' },
    { action: 'tool-copy', tool: 'copy', icon: '⧉', label: 'Copiar', title: 'Copiar (CO)' },
    { action: 'tool-trim', tool: 'trim', icon: '⌁', label: 'Aparar', title: 'Aparar (TR)' },
    { action: 'tool-hatch', tool: 'hatch', icon: '▧', label: 'Hachura', title: 'Hachura (H)' },
    { action: 'tool-measure', tool: 'measure', icon: '⌖', label: 'Medir', title: 'Medir distância (DI)' },
  ], precision);

  const layers = addGroup(ribbon, 'cad-ribbon-layer-manager', 'Camadas', [
    { action: 'focus-layers', icon: '▤', label: 'Layer atual', title: 'Abrir gerenciador de camadas' },
    { action: 'new-layer', icon: '＋', label: 'Nova layer', title: 'Criar uma nova camada' },
    { action: 'focus-properties', icon: '☷', label: 'Propriedades', title: 'Abrir PropertyManager' },
  ], precision);

  const display = addGroup(ribbon, 'cad-ribbon-display-mode', 'Visualização 2D', [
    { action: 'display-wireframe', icon: '◇', label: 'Linhas', title: 'Modo estrutura / wireframe' },
    { action: 'display-solid', icon: '◆', label: 'Sólido 2D', title: 'Preencher contornos fechados sem criar 3D' },
  ], null);

  if (featured) featured.dataset.cadTabs = 'home';
  if (homeQuick) homeQuick.dataset.cadTabs = 'home';
  if (draw) draw.dataset.cadTabs = 'draw';
  if (hatch) hatch.dataset.cadTabs = 'draw';
  if (modify) modify.dataset.cadTabs = 'modify';
  if (arrays) arrays.dataset.cadTabs = 'modify';
  if (selection) selection.dataset.cadTabs = 'modify';
  if (annotation) annotation.dataset.cadTabs = 'annotate';
  if (layers) layers.dataset.cadTabs = 'layers';
  if (precision) precision.dataset.cadTabs = 'view';
  if (display) display.dataset.cadTabs = 'view';

  Array.from(ribbon.querySelectorAll(':scope > .cad-ribbon-group')).forEach((group) => {
    if (!group.dataset.cadTabs) group.dataset.cadTabs = 'home';
  });

  const tabs = document.createElement('div');
  tabs.className = 'cad-command-tabs';
  tabs.setAttribute('role', 'tablist');
  [
    ['home', 'Início'],
    ['draw', 'Desenhar'],
    ['modify', 'Modificar'],
    ['annotate', 'Anotar'],
    ['layers', 'Camadas'],
    ['view', 'Vista'],
  ].forEach(([id, label]) => tabs.appendChild(createTabButton(id, label)));
  toolbar.insertBefore(tabs, ribbon);

  tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('.cad-command-tab');
    if (!tab) return;
    activateCadTab(ribbon, tabs, tab.dataset.cadTab);
  });
  activateCadTab(ribbon, tabs, 'home');

  const priorAction = cad.executeAction.bind(cad);
  cad.executeAction = (action, source) => {
    if (action === 'focus-layers' || action === 'new-layer' || action === 'focus-properties') {
      const rightPanel = document.getElementById('cadRightPanel');
      rightPanel?.classList.remove('collapsed');
      const target = action === 'new-layer' ? document.getElementById('cadLayerNewName')
        : action === 'focus-layers' ? document.getElementById('cadLayerSelect')
          : document.getElementById('cadProperties');
      const details = target?.closest('details');
      if (details) details.open = true;
      target?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      if (action === 'new-layer') target?.focus?.();
      return;
    }
    return priorAction(action, source);
  };
}

function ensureSolidLayer() {
  const svg = document.getElementById('cadCanvas');
  if (!svg) return null;
  let layer = svg.querySelector(':scope > g[data-cad-solid-layer]');
  if (layer) return layer;
  layer = document.createElementNS(SVG_NS, 'g');
  layer.dataset.cadSolidLayer = '1';
  layer.setAttribute('pointer-events', 'none');
  const entityLayer = svg.children[1] || null;
  svg.insertBefore(layer, entityLayer);
  return layer;
}

function solidFillFor(entity, cad) {
  const selected = cad.selection?.includes?.(entity.id);
  if (selected) return { color: '#3aa7e8', opacity: 0.24 };
  const primitive = entity.metadata?.primitive;
  if (primitive === 'ellipse') return { color: '#7892a6', opacity: 0.24 };
  if (entity.type === 'shaft') return { color: '#8999a8', opacity: 0.28 };
  return { color: '#718596', opacity: 0.22 };
}

function renderSolidOverlay(cad) {
  const layer = ensureSolidLayer();
  if (!layer || !cad?.viewport || !cad?.state) return;
  layer.innerHTML = '';
  const shell = document.querySelector('.cad-fullscreen');
  if (shell?.dataset.displayMode !== 'solid') return;

  const zoom = cad.viewport.getViewState().zoom;
  const screen = (x, y) => cad.viewport.worldToScreen(x, y);
  const visible = (entity) => {
    if (entity.visible === false) return false;
    const layerName = entity.metadata?.layer || cad.state.activeLayer;
    return cad.state.layers?.[layerName]?.visible !== false;
  };

  cad.state.entities.filter(visible).forEach((entity) => {
    const fill = solidFillFor(entity, cad);
    const attrs = `fill='${fill.color}' fill-opacity='${fill.opacity}' stroke='none'`;
    const g = entity.geometry || {};

    if (entity.type === 'rect') {
      const x = g.width < 0 ? g.x + g.width : g.x;
      const y = g.height < 0 ? g.y + g.height : g.y;
      const p = screen(x, y);
      layer.insertAdjacentHTML('beforeend', `<rect x='${p.x}' y='${p.y}' width='${Math.abs(g.width * zoom)}' height='${Math.abs(g.height * zoom)}' ${attrs}/>`);
      return;
    }
    if (entity.type === 'circle') {
      const c = screen(g.cx, g.cy);
      layer.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='${Math.abs(g.radius * zoom)}' ${attrs}/>`);
      return;
    }
    if (entity.type === 'polyline' && g.closed && (g.points || []).length >= 3) {
      const points = g.points.map((point) => screen(point.x, point.y)).map((point) => `${point.x},${point.y}`).join(' ');
      layer.insertAdjacentHTML('beforeend', `<polygon points='${points}' ${attrs}/>`);
      return;
    }
    if (entity.type === 'shaft') {
      const origin = g.origin || { x: 0, y: 0 };
      const orientation = g.orientation || 'horizontal';
      let x = origin.x;
      let y = origin.y;
      (g.segments || []).forEach((segment) => {
        const len = Number(segment.length || 0);
        const diameter = Number(segment.diameter || 0);
        const radius = diameter / 2;
        const p = screen(x - (orientation === 'vertical' ? radius : 0), y - (orientation === 'horizontal' ? radius : 0));
        const width = Math.abs((orientation === 'horizontal' ? len : diameter) * zoom);
        const height = Math.abs((orientation === 'horizontal' ? diameter : len) * zoom);
        layer.insertAdjacentHTML('beforeend', `<rect x='${p.x}' y='${p.y}' width='${width}' height='${height}' ${attrs}/>`);
        if (orientation === 'horizontal') x += len; else y += len;
      });
    }
  });
}

function updateDisplayButtons(mode) {
  document.querySelectorAll('[data-action="display-wireframe"], [data-action="display-solid"]').forEach((el) => {
    const active = (mode === 'solid' && el.dataset.action === 'display-solid') || (mode === 'wireframe' && el.dataset.action === 'display-wireframe');
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function installDisplayMode(cad) {
  if (!cad || cad.__displayModeInstalled) return;
  cad.__displayModeInstalled = true;
  const shell = document.querySelector('.cad-fullscreen');
  if (!shell) return;

  const savedMode = window.localStorage?.getItem?.('cad2d.displayMode');
  shell.dataset.displayMode = savedMode === 'solid' ? 'solid' : 'wireframe';

  const priorRender = cad.render.bind(cad);
  cad.render = (...args) => {
    const result = priorRender(...args);
    renderSolidOverlay(cad);
    updateDisplayButtons(shell.dataset.displayMode);
    return result;
  };

  const priorAction = cad.executeAction.bind(cad);
  cad.executeAction = (action, source) => {
    if (action === 'display-wireframe' || action === 'display-solid') {
      const mode = action === 'display-solid' ? 'solid' : 'wireframe';
      shell.dataset.displayMode = mode;
      window.localStorage?.setItem?.('cad2d.displayMode', mode);
      cad.state.statusMessage = mode === 'solid' ? 'Modo Sólido 2D ativado.' : 'Modo Linhas ativado.';
      cad.render();
      return;
    }
    return priorAction(action, source);
  };

  const statusbar = document.querySelector('.cad-statusbar');
  if (statusbar && !statusbar.querySelector('.cad-display-status-switch')) {
    const switcher = document.createElement('div');
    switcher.className = 'cad-display-status-switch';
    switcher.innerHTML = '<span>VISUAL</span><button type="button" data-action="display-wireframe">LINHAS</button><button type="button" data-action="display-solid">SÓLIDO</button>';
    statusbar.appendChild(switcher);
  }
  cad.render();
}

function updateFeatureManager(cad) {
  const left = document.querySelector('.cad-panel-left');
  const head = left?.querySelector('.cad-feature-manager-head');
  if (!left || !head) return;
  let summary = left.querySelector('.cad-feature-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'cad-feature-summary';
    head.insertAdjacentElement('afterend', summary);
  }
  const entities = cad.state?.entities || [];
  const dimensions = entities.filter((entity) => entity.type === 'dimension').length;
  const hatches = entities.filter((entity) => entity.metadata?.primitive === 'hatch').length;
  const layers = Object.keys(cad.state?.layers || {}).length;
  summary.innerHTML = `<div><span>▤</span><strong>${layers}</strong><small>layers</small></div><div><span>◇</span><strong>${entities.length}</strong><small>objetos</small></div><div><span>↔</span><strong>${dimensions}</strong><small>cotas</small></div><div><span>▧</span><strong>${hatches}</strong><small>hachuras</small></div>`;
}

function installFeatureManagerSummary(cad) {
  if (!cad || cad.__featureSummaryInstalled) return;
  cad.__featureSummaryInstalled = true;
  const priorRender = cad.render.bind(cad);
  cad.render = (...args) => {
    const result = priorRender(...args);
    updateFeatureManager(cad);
    return result;
  };
  cad.render();
}

export function installCadFinal2D(cad) {
  if (!cad) return;
  installFinalTools(cad);
  installFinalRibbon();
  installTechnicalShell(cad);
  installCommandManagerTabs(cad);
  installDisplayMode(cad);
  installFeatureManagerSummary(cad);
}
