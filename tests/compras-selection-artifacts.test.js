const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('fila de compras neutraliza seleção nativa sem afetar filtros', () => {
  const css = read('public/css/compras-active-priority-fix.css');
  assert.match(css, /\.request-row[\s\S]*user-select:none!important/);
  assert.match(css, /-webkit-tap-highlight-color:transparent!important/);
  assert.match(css, /::selection[\s\S]*background:transparent!important/);
  assert.doesNotMatch(css, /dashboard-filters[^\{]*\{[^}]*user-select:none/i);
});

test('textos da fila nao herdam fundo vermelho ou azul dos grupos de prioridade', () => {
  const css = read('public/css/compras-active-priority-fix.css');
  assert.match(css, /\.priority-section \.request-row \.request-os > b[\s\S]*\.priority-section \.request-row \.purchase-data > span > b[\s\S]*background:transparent!important/);
  assert.match(css, /\.priority-section > h3 > b[\s\S]*background:#eef2f7!important/);
  assert.doesNotMatch(css, /\.item-progress\s*>\s*b[^\{]*\{[^}]*background:transparent!important/i);
});

test('javascript limpa ranges residuais somente na fila operacional', () => {
  const js = read('public/js/compras-dashboard.js');
  assert.match(js, /selectionTouchesRequestRow/);
  assert.match(js, /selection\.removeAllRanges\(\)/);
  assert.match(js, /selectstart/);
  assert.match(js, /dragstart/);
  assert.match(js, /selectionchange/);
  assert.match(js, /pageshow/);
});

test('view força nova versão de cache dos assets de compras', () => {
  const view = read('views/compras/solicitacoes/index.ejs');
  assert.match(view, /compras-active-priority-fix\.css\?v=20260819-selection-artifacts-v2/);
  assert.match(view, /compras-dashboard\.js\?v=20260819-selection-artifacts-v2/);
});
