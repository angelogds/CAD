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

function button({ action, tool, icon, label, title }) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cad-ribbon-btn';
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
  if (ribbon.querySelector(`.${className}`)) return;
  const group = document.createElement('div');
  group.className = `cad-ribbon-group ${className}`;
  group.innerHTML = `<span class="cad-ribbon-label">${label}</span>`;
  items.forEach((item) => group.appendChild(button(item)));
  if (before) ribbon.insertBefore(group, before); else ribbon.appendChild(group);
}

function ensureStyleSheet() {
  if (document.querySelector('link[data-cad-final2d-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/cad-solidworks-workbench.css?v=20260819-final2d-v1';
  link.dataset.cadFinal2dStyle = '1';
  document.head.appendChild(link);
}

function installSolidWorksLayout(cad) {
  ensureStyleSheet();
  const shell = document.querySelector('.cad-fullscreen');
  if (!shell) return;
  shell.classList.add('cad-solidworks-shell');
  shell.classList.remove('cad-theme-dark');
  shell.classList.add('cad-theme-light');
  document.body.classList.add('cad-solidworks-mode');

  const appbar = document.querySelector('.cad-appbar');
  if (appbar && !appbar.querySelector('.cad-workbench-badge')) {
    const heading = appbar.querySelector('.cad-document-heading');
    const badge = document.createElement('span');
    badge.className = 'cad-workbench-badge';
    badge.textContent = 'CAD 2D • WORKBENCH';
    heading?.prepend(badge);
  }

  const left = document.querySelector('.cad-panel-left');
  if (left && !left.querySelector('.cad-feature-manager-head')) {
    const head = document.createElement('div');
    head.className = 'cad-feature-manager-head';
    head.innerHTML = '<strong>FeatureManager</strong><span>Ferramentas 2D</span>';
    left.prepend(head);
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
  if (command) command.placeholder = 'Comandos: L, C, EL, SPL, H, M, RO, FI, CHA, SC, ST, BR, J, XP, AR, AP...';
}

export function installCadFinal2D(cad) {
  if (!cad) return;
  installFinalTools(cad);
  installFinalRibbon();
  installSolidWorksLayout(cad);
}
