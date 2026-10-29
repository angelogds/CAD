const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const entry = fs.readFileSync(path.join(root, 'public/js/cad-final-2d.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/cad-solidworks-workbench.css'), 'utf8');

test('CommandManager do CAD usa abas técnicas em vez de exibir todas as ferramentas ao mesmo tempo', () => {
  assert.match(entry, /cad-command-tabs/);
  assert.match(entry, /\['home', 'Início'\]/);
  assert.match(entry, /\['draw', 'Desenhar'\]/);
  assert.match(entry, /\['modify', 'Modificar'\]/);
  assert.match(entry, /\['annotate', 'Anotar'\]/);
  assert.doesNotMatch(entry, /\['layers', 'Camadas'\]/);
  assert.match(entry, /utility.dataset.cadTabs = 'home'/);
  assert.match(entry, /action: 'calculator'/);
  assert.match(entry, /\['view', 'Vista'\]/);
  assert.match(entry, /group\.hidden = !assigned\.includes\(active\)/);
  assert.match(css, /\.cad-technical-shell \.cad-ribbon-group\[hidden\]/);
});

test('modo Sólido 2D preenche somente primitivas fechadas sem alterar o modelo persistido', () => {
  assert.match(entry, /display-wireframe/);
  assert.match(entry, /display-solid/);
  assert.match(entry, /renderSolidOverlay/);
  assert.match(entry, /data-cad-solid-layer/);
  assert.match(entry, /entity\.type === 'rect'/);
  assert.match(entry, /entity\.type === 'circle'/);
  assert.match(entry, /entity\.type === 'polyline' && g\.closed/);
  assert.match(entry, /entity\.type === 'shaft'/);
  assert.match(entry, /localStorage.*cad2d\.displayMode/);
  assert.doesNotMatch(entry, /state\.displayMode\s*=/);
});

test('editor preserva identidade Campo do Gado com canvas e controles em tema técnico', () => {
  const identity = fs.readFileSync(path.join(root, 'public/css/cad-system-shell.css'), 'utf8');
  assert.match(identity, /--cad-system-green:var\(--action-700,#15803d\)/);
  assert.match(identity, /--cad-canvas:/);
  assert.match(identity, /cad-theme-light/);
  assert.match(entry, /brand.textContent = 'CG'/);
  assert.doesNotMatch(entry, /textContent = 'PropertyManager'|<strong>FeatureManager/);

});

test('explorador mantém resumo do desenho sem duplicar ferramentas laterais', () => {
  assert.match(entry, /cad-feature-summary/);
  assert.match(entry, /camadas/);
  assert.match(entry, /objetos/);
  assert.match(entry, /cotas/);
  assert.match(entry, /hachuras/);
  assert.match(css, /\.cad-feature-manager-head/);
  assert.match(entry, /Explorador/);
  assert.doesNotMatch(entry, /cad-tool-group-final2d/);
});

test('ribbon usa ícones SVG técnicos consistentes em vez de glifos como acabamento final', () => {
  assert.match(entry, /const CAD_ICONS =/);
  assert.match(entry, /const CAD_ACTION_ICONS =/);
  assert.match(entry, /function cadIcon/);
  assert.match(entry, /viewBox=\"0 0 24 24\"/);
  assert.match(entry, /'tool-line': 'line'/);
  assert.match(entry, /'tool-circle': 'circle'/);
  assert.match(entry, /'tool-trim': 'trim'/);
  assert.match(entry, /'tool-dim-linear': 'dimLinear'/);
  assert.match(entry, /installProfessionalIcons/);
  assert.match(css, /\.cad-icon-svg/);
  assert.match(css, /\.cad-ribbon-icon/);
  assert.match(entry, /el.dataset.shortcut = shortcut/);
});

test('workspace adiciona cromado de navegação 2D inspirado em CAD profissional', () => {
  assert.match(entry, /installProfessionalChrome/);
  assert.match(entry, /cad-quick-access/);
  assert.match(entry, /cad-drawing-tabbar/);
  assert.match(entry, /cad-navigation-bar/);
  assert.match(entry, /cad-ucs-indicator/);
  assert.match(entry, /SUPERIOR/);
  assert.match(entry, /WCS/);
  assert.match(css, /\.cad-ribbon-home-quick/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.cad-navigation-bar/);
  assert.match(css, /\.cad-ucs-indicator/);
});

test('aba ativa do CommandManager é lembrada sem entrar no JSON persistido', () => {
  assert.match(entry, /cad2d\.commandTab/);
  assert.match(entry, /localStorage/);
  assert.doesNotMatch(entry, /state\.commandTab\s*=/);
});
