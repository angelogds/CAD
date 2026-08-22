const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const indexView = fs.readFileSync('views/pcm/index.ejs', 'utf8');
const internalStyles = fs.readFileSync('views/pcm/partials/internal-styles.ejs', 'utf8');
const internalNav = fs.readFileSync('views/pcm/partials/internal-nav.ejs', 'utf8');
const operationalCss = fs.readFileSync('public/css/pcm-operational.css', 'utf8');
const dashboardCss = fs.readFileSync('public/css/pcm-dashboard.css', 'utf8');

test('submenu do PCM usa barra horizontal acessível e não comprime o conteúdo', () => {
  assert.match(internalNav, /<nav class="pcm-nav" aria-label="Submódulos do PCM">/);
  assert.match(internalStyles, /\.pcm-shell\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(internalStyles, /\.pcm-nav\{display:flex;align-items:center/);
  assert.match(internalStyles, /overflow-x:auto/);
  assert.doesNotMatch(internalStyles, /grid-template-columns:220px minmax\(0,1fr\)/);
});

test('painel principal aproveita largura e evita cards esticados', () => {
  assert.match(operationalCss, /\.pcm-op-page\{[^}]*width:100%;max-width:none;min-width:0/);
  assert.match(operationalCss, /\.pcm-op-kpis\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(operationalCss, /\.pcm-op-grid\{display:grid;gap:14px;align-items:start/);
  assert.match(operationalCss, /\.pcm-op-table\{width:100%;min-width:860px/);
  assert.match(dashboardCss, /\.pcm-directors-layout\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
});

test('fila compacta informações relacionadas para preservar a coluna de ação', () => {
  assert.ok(indexView.includes('Tipo / Prioridade'));
  assert.ok(indexView.includes('Status / SLA'));
  assert.ok(indexView.includes('colspan="6"'));
  assert.doesNotMatch(indexView, /<th>Tempo em aberto<\/th>/);
});

test('IA e alertas exibem resumo operacional com expansão sob demanda', () => {
  assert.ok(indexView.includes('aiPriorities.slice(0, 3)'));
  assert.ok(indexView.includes('class="pcm-op-ai-more"'));
  assert.ok(indexView.includes('(p.alertas || []).slice(0, 5)'));
  assert.ok(indexView.includes('pcm-op-alert-count'));
});

test('status fechados não achatam visualmente os estados ativos', () => {
  assert.ok(indexView.includes('const activeStatusRows'));
  assert.ok(indexView.includes('const maxActiveStatus'));
  assert.ok(indexView.includes('fechadas no período, separadas da fila operacional'));
});
