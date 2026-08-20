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
  assert.match(entry, /\['layers', 'Camadas'\]/);
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

test('interface CAD abandona verde institucional dentro do editor e usa paleta técnica neutra', () => {
  assert.match(css, /--cad-accent: #43a6e2/);
  assert.match(css, /--cad-canvas: #1c2329/);
  assert.match(css, /background: #1b2228 !important/);
  assert.match(entry, /cad-theme-dark/);
  assert.match(entry, /DESENHO MECÂNICO • CAD 2D/);
  assert.doesNotMatch(css, /#159653/i);
  assert.doesNotMatch(css, /#0d8044/i);
});

test('FeatureManager mantém nomes visíveis e mostra resumo do desenho', () => {
  assert.match(entry, /cad-feature-summary/);
  assert.match(entry, /layers/);
  assert.match(entry, /objetos/);
  assert.match(entry, /cotas/);
  assert.match(entry, /hachuras/);
  assert.match(css, /\.cad-tool-btn > span:last-child/);
  assert.match(css, /display: inline !important/);
});
