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

const CAD_ICONS = {
  select: '<path d="M5 3l13 9-6 1.6 3.6 5.2-2.5 1.7-3.5-5.3L5 19V3z"/>',
  line: '<path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.5"/><circle cx="19" cy="5" r="1.5"/>',
  polyline: '<path d="M4 18l5-9 5 5 6-9"/><circle cx="4" cy="18" r="1.3"/><circle cx="9" cy="9" r="1.3"/><circle cx="14" cy="14" r="1.3"/><circle cx="20" cy="5" r="1.3"/>',
  circle: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  arc: '<path d="M5 17A10 10 0 0119 7"/><circle cx="5" cy="17" r="1.4"/><circle cx="19" cy="7" r="1.4"/>',
  rect: '<rect x="5" y="6" width="14" height="12" rx=".8"/><circle cx="5" cy="6" r="1.2"/><circle cx="19" cy="18" r="1.2"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="5.5"/><path d="M3 12h18M12 5v14" stroke-dasharray="2 2"/>',
  spline: '<path d="M3 16c4-11 7 5 11-4s6-3 7-5"/><circle cx="3" cy="16" r="1.2"/><circle cx="21" cy="7" r="1.2"/>',
  flange: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="6" r="1"/><circle cx="18" cy="12" r="1"/><circle cx="12" cy="18" r="1"/><circle cx="6" cy="12" r="1"/>',
  shaft: '<path d="M3 9h4V7h5v2h5v2h4v4h-4v2h-5v-2H7v-2H3V9z"/><path d="M2 12h20" stroke-dasharray="2 2"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3m3-3l3 3M21 12l-3-3m3 3l-3 3M12 21l-3-3m3 3l3-3M3 12l3-3m-3 3l3 3"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="1"/><path d="M16 8V5H5v11h3"/>',
  offset: '<path d="M5 18L15 4M10 20L20 6"/><path d="M7 7l4 3M14 14l4 3" stroke-dasharray="2 2"/>',
  trim: '<path d="M4 18L18 4M4 6l5 5M13 15l5 5"/><circle cx="10.5" cy="12.5" r="1.4"/>',
  extend: '<path d="M4 17L15 6M17 4h3v3M20 4l-6 6M4 20h16"/>',
  delete: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7"/>',
  scale: '<rect x="6" y="9" width="9" height="9"/><path d="M10 14L20 4M14 4h6v6"/>',
  stretch: '<path d="M4 7v10h7M20 7v10h-5M8 12h9M8 12l3-3m-3 3l3 3M17 12l-3-3m3 3l-3 3"/>',
  break: '<path d="M3 15l7-7M14 12l7-7M10 14l4-4"/><path d="M10 9l4 6"/>',
  join: '<path d="M9 15l-1.5 1.5a3.5 3.5 0 01-5-5L6 8a3.5 3.5 0 015 0M15 9l1.5-1.5a3.5 3.5 0 015 5L18 16a3.5 3.5 0 01-5 0M8 12h8"/>',
  explode: '<circle cx="12" cy="12" r="2"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19"/>',
  arrayRect: '<rect x="4" y="4" width="5" height="5"/><rect x="15" y="4" width="5" height="5"/><rect x="4" y="15" width="5" height="5"/><rect x="15" y="15" width="5" height="5"/>',
  arrayPolar: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="20" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 2"/>',
  hatch: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 10l6-6M4 16L16 4M8 20L20 8M14 20l6-6"/>',
  text: '<path d="M5 5h14M12 5v14M8 19h8"/>',
  dimLinear: '<path d="M4 7v10M20 7v10M4 12h16M4 12l3-2m-3 2l3 2M20 12l-3-2m3 2l-3 2"/>',
  dimDiameter: '<circle cx="12" cy="12" r="8"/><path d="M5 19L19 5M7 17l1-4m9-6l-1 4"/>',
  dimAngular: '<path d="M5 18L12 5l7 13M8 15a5 5 0 018 0"/>',
  centerline: '<path d="M3 12h18M12 3v18" stroke-dasharray="5 2 1 2"/>',
  measure: '<path d="M4 16L16 4l4 4L8 20l-4-4z"/><path d="M9 11l2 2M12 8l2 2M6 14l2 2"/>',
  pan: '<path d="M8 12V6a1.5 1.5 0 013 0v5-7a1.5 1.5 0 013 0v7-5a1.5 1.5 0 013 0v6-3a1.5 1.5 0 013 0v6c0 4-2.5 6-6 6h-1c-2 0-3.5-.8-4.7-2.2L3 16.5a1.6 1.6 0 012.3-2.2L8 17"/>',
  zoom: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21M10 7v6M7 10h6"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="8" y="8" width="8" height="8"/>',
  grid: '<path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16"/>',
  snap: '<circle cx="12" cy="12" r="4"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  ortho: '<path d="M5 4v15h15M9 15h6V9"/>',
  layer: '<path d="M12 3L3 8l9 5 9-5-9-5zM5 12l7 4 7-4M5 16l7 4 7-4"/>',
  layerAdd: '<path d="M10 4L3 8l7 4 7-4-7-4zM4 12l6 3.5 4-2.3M4 16l6 3.5 3-1.7M18 13v8M14 17h8"/>',
  properties: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h10M18 18h2"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  wireframe: '<path d="M12 3l8 5v8l-8 5-8-5V8l8-5zM4 8l8 5 8-5M12 13v8"/>',
  solid: '<path d="M12 3l8 5v8l-8 5-8-5V8l8-5z" fill="currentColor" fill-opacity=".28"/><path d="M12 3l8 5v8l-8 5-8-5V8l8-5zM4 8l8 5 8-5M12 13v8"/>',
  undo: '<path d="M9 7H4v-5M4 7c3-4 9-5 13-1s4 10 0 14"/>',
  redo: '<path d="M15 7h5v-5M20 7c-3-4-9-5-13-1s-4 10 0 14"/>',
  theme: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  save: '<path d="M4 3h13l3 3v15H4V3zM8 3v6h8V3M8 21v-7h8v7"/>',
  pdf: '<path d="M6 3h8l4 4v14H6V3zM14 3v5h5"/><path d="M8 17h2a2 2 0 000-4H8v5M13 18v-5h2.5M13 15h2"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  equipment: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  drawing: '<path d="M5 3h10l4 4v14H5V3zM15 3v5h5M8 16l3-4 2 2 3-4"/>',
};

const CAD_ACTION_ICONS = {
  'tool-select': 'select', 'tool-line': 'line', 'tool-polyline': 'polyline', 'tool-circle': 'circle', 'tool-arc': 'arc', 'tool-rect': 'rect',
  'tool-ellipse': 'ellipse', 'tool-spline': 'spline', 'tool-flange': 'flange', 'tool-shaft': 'shaft', 'tool-text': 'text',
  'tool-move': 'move', 'tool-copy': 'copy', 'tool-offset': 'offset', 'tool-trim': 'trim', 'tool-extend': 'extend', 'delete-selection': 'delete',
  'tool-scale': 'scale', 'tool-stretch': 'stretch', 'tool-break': 'break', 'tool-join': 'join', 'tool-explode': 'explode',
  'tool-array-rect': 'arrayRect', 'tool-array-polar': 'arrayPolar', 'tool-hatch': 'hatch',
  'tool-dim-linear': 'dimLinear', 'tool-dim-diameter': 'dimDiameter', 'tool-dim-angular': 'dimAngular', 'tool-centerline': 'centerline', 'tool-measure': 'measure',
  'tool-pan': 'pan', 'tool-zoom-window': 'zoom', 'zoom-extents': 'fit', 'toggle-grid': 'grid', 'toggle-snap': 'snap', 'toggle-ortho': 'ortho',
  'focus-layers': 'layer', 'new-layer': 'layerAdd', 'add-layer': 'layerAdd', 'focus-properties': 'properties',
  'display-wireframe': 'wireframe', 'display-solid': 'solid', undo: 'undo', redo: 'redo', 'toggle-theme': 'theme', save: 'save', 'toggle-right-panel': 'chevron',
};

const CAD_ACTION_SHORTCUTS = {
  'tool-line': 'L', 'tool-polyline': 'PL', 'tool-circle': 'C', 'tool-arc': 'A', 'tool-rect': 'REC', 'tool-ellipse': 'EL', 'tool-spline': 'SPL',
  'tool-flange': 'F', 'tool-shaft': 'X', 'tool-move': 'M', 'tool-copy': 'CO', 'tool-offset': 'O', 'tool-trim': 'TR', 'tool-extend': 'EX',
  'tool-scale': 'SC', 'tool-stretch': 'ST', 'tool-break': 'BR', 'tool-join': 'J', 'tool-explode': 'XP', 'tool-array-rect': 'AR',
  'tool-array-polar': 'AP', 'tool-hatch': 'H', 'tool-measure': 'DI', 'tool-dim-linear': 'DLI', 'tool-dim-diameter': 'DDI', 'tool-dim-angular': 'DAN',
};

function cadIcon(name, className = '') {
  const drawing = CAD_ICONS[name] || CAD_ICONS.properties;
  return `<svg class="cad-icon-svg${className ? ` ${className}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawing}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function button({ action, tool, icon, label, title, className = '' }) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `cad-ribbon-btn${className ? ` ${className}` : ''}`;
  el.dataset.action = action;
  if (tool) el.dataset.tool = tool;
  el.title = title || label;
  el.setAttribute('aria-label', label);
  const shortcut = CAD_ACTION_SHORTCUTS[action];
  if (shortcut) el.dataset.shortcut = shortcut;
  el.innerHTML = `<span class="cad-ribbon-icon" aria-hidden="true">${cadIcon(CAD_ACTION_ICONS[action] || icon)}</span><span>${label}</span>`;
  return el;
}

function sideButton(config) {
  const el = button(config);
  el.className = 'cad-tool-btn';
  el.dataset.tooltip = config.title || config.label;
  el.innerHTML = `<span class="cad-tool-icon" aria-hidden="true">${cadIcon(CAD_ACTION_ICONS[config.action] || config.icon)}</span><span>${config.label}</span>`;
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
    existing.href = '/css/cad-solidworks-workbench.css?v=20260822-autocad-icons-v3';
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/cad-solidworks-workbench.css?v=20260822-autocad-icons-v3';
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
  window.localStorage?.setItem?.('cad2d.commandTab', active);
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
  const savedTab = window.localStorage?.getItem?.('cad2d.commandTab');
  const initialTab = ['home', 'draw', 'modify', 'annotate', 'layers', 'view'].includes(savedTab) ? savedTab : 'home';
  activateCadTab(ribbon, tabs, initialTab);

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
  summary.innerHTML = `<div><span>${cadIcon('layer')}</span><strong>${layers}</strong><small>layers</small></div><div><span>${cadIcon('wireframe')}</span><strong>${entities.length}</strong><small>objetos</small></div><div><span>${cadIcon('dimLinear')}</span><strong>${dimensions}</strong><small>cotas</small></div><div><span>${cadIcon('hatch')}</span><strong>${hatches}</strong><small>hachuras</small></div>`;
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

function replaceCommandIcon(el, slotSelector, slotClass) {
  const action = el.dataset.action;
  const iconName = CAD_ACTION_ICONS[action];
  if (!iconName) return;
  let slot = el.querySelector(slotSelector);
  if (!slot) {
    slot = document.createElement('span');
    slot.className = slotClass;
    slot.setAttribute('aria-hidden', 'true');
    const label = Array.from(el.children).find((child) => child.tagName === 'SPAN');
    el.insertBefore(slot, label || el.firstChild);
  }
  slot.innerHTML = cadIcon(iconName);
  Array.from(el.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) node.remove();
  });
  const shortcut = CAD_ACTION_SHORTCUTS[action];
  if (shortcut) el.dataset.shortcut = shortcut;
}

function installProfessionalIcons() {
  document.querySelectorAll('.cad-ribbon-btn[data-action]').forEach((el) => replaceCommandIcon(el, '.cad-ribbon-icon', 'cad-ribbon-icon'));
  document.querySelectorAll('.cad-tool-btn[data-action]').forEach((el) => replaceCommandIcon(el, '.cad-tool-icon', 'cad-tool-icon'));

  document.querySelectorAll('.cad-icon-btn[data-action], .cad-panel-handle[data-action]').forEach((el) => {
    const iconName = CAD_ACTION_ICONS[el.dataset.action];
    if (iconName) el.innerHTML = cadIcon(iconName);
  });

  const back = document.querySelector('.cad-back');
  if (back) back.innerHTML = cadIcon('back');

  document.querySelectorAll('.cad-chip[data-action]').forEach((el) => {
    const iconName = CAD_ACTION_ICONS[el.dataset.action];
    if (iconName && !el.querySelector('.cad-chip-icon')) el.insertAdjacentHTML('afterbegin', `<span class="cad-chip-icon">${cadIcon(iconName)}</span>`);
  });

  const save = document.querySelector('.cad-btn[data-action="save"]');
  if (save && !save.querySelector('.cad-button-icon')) save.insertAdjacentHTML('afterbegin', `<span class="cad-button-icon">${cadIcon('save')}</span>`);
  const pdf = document.querySelector('.cad-btn[href$="/pdf"]');
  if (pdf && !pdf.querySelector('.cad-button-icon')) pdf.insertAdjacentHTML('afterbegin', `<span class="cad-button-icon">${cadIcon('pdf')}</span>`);

  const equipment = document.querySelector('.cad-equipment-icon');
  if (equipment) equipment.innerHTML = cadIcon('equipment');
  const flangePreview = document.querySelector('.cad-part-preview');
  if (flangePreview) flangePreview.innerHTML = cadIcon('flange');

  [
    ['.cad-feature-manager-head strong', 'wireframe', 'FeatureManager'],
    ['.cad-inspector-head strong', 'properties', 'PropertyManager'],
  ].forEach(([selector, iconName, label]) => {
    const title = document.querySelector(selector);
    if (title && !title.querySelector('.cad-manager-icon')) title.innerHTML = `<span class="cad-manager-icon">${cadIcon(iconName)}</span><span>${label}</span>`;
  });

  document.querySelectorAll('.cad-start-card[data-action]').forEach((card) => {
    const first = card.querySelector(':scope > span');
    const iconName = CAD_ACTION_ICONS[card.dataset.action];
    if (first && iconName) first.innerHTML = cadIcon(iconName);
  });
}

function installProfessionalChrome() {
  const appbarStart = document.querySelector('.cad-appbar-start');
  const heading = appbarStart?.querySelector('.cad-document-heading');
  if (appbarStart && heading && !appbarStart.querySelector('.cad-quick-access')) {
    const quick = document.createElement('div');
    quick.className = 'cad-quick-access';
    quick.setAttribute('aria-label', 'Acesso rápido');
    ['undo', 'redo'].forEach((action) => {
      const control = document.querySelector(`.cad-appbar-actions [data-action="${action}"]`);
      if (control) quick.appendChild(control);
    });
    appbarStart.insertBefore(quick, heading);
  }

  const canvas = document.querySelector('.cad-canvas-container');
  if (!canvas || canvas.querySelector('.cad-drawing-tabbar')) return;

  const code = document.querySelector('.cad-document-title strong')?.textContent?.trim() || 'DESENHO';
  const title = document.querySelector('.cad-document-title > span')?.textContent?.trim() || 'Sem título';
  const tabbar = document.createElement('div');
  tabbar.className = 'cad-drawing-tabbar';
  tabbar.innerHTML = `<div class="cad-drawing-tab active"><span>${cadIcon('drawing')}</span><strong>${escapeHtml(code)}</strong><small>${escapeHtml(title)}</small><em>2D</em></div><div class="cad-view-system"><span>SUPERIOR</span><strong>WCS</strong></div>`;
  canvas.prepend(tabbar);

  const navigation = document.createElement('div');
  navigation.className = 'cad-navigation-bar';
  navigation.setAttribute('aria-label', 'Navegação do desenho');
  navigation.innerHTML = [
    ['tool-pan', 'pan', 'Mover vista (Pan)'],
    ['tool-zoom-window', 'zoom', 'Zoom por janela'],
    ['zoom-extents', 'fit', 'Enquadrar todo o desenho'],
  ].map(([action, iconName, label]) => `<button type="button" data-action="${action}" title="${label}" aria-label="${label}">${cadIcon(iconName)}</button>`).join('');
  canvas.appendChild(navigation);

  const ucs = document.createElement('div');
  ucs.className = 'cad-ucs-indicator';
  ucs.setAttribute('aria-label', 'Sistema de coordenadas mundial');
  ucs.innerHTML = '<span class="cad-ucs-origin"></span><span class="cad-ucs-axis cad-ucs-x">X</span><span class="cad-ucs-axis cad-ucs-y">Y</span><small>WCS</small>';
  canvas.appendChild(ucs);
}

export function installCadFinal2D(cad) {
  if (!cad) return;
  installFinalTools(cad);
  installFinalRibbon();
  installTechnicalShell(cad);
  installCommandManagerTabs(cad);
  installDisplayMode(cad);
  installFeatureManagerSummary(cad);
  installProfessionalIcons();
  installProfessionalChrome();
}
