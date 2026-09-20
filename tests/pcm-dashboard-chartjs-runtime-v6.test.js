const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Chart.js é dependência local fixa do sistema', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['chart.js'], '4.4.7');
});

test('servidor publica o Chart.js instalado pelo Railway', () => {
  const server = read('server.js');
  assert.match(server, /app\.use\("\/vendor\/chart\.js"/);
  assert.match(server, /node_modules", "chart\.js", "dist"/);
});

test('dashboard usa Chart.js local com fallback externo', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(view, /\/vendor\/chart\.js\/chart\.umd\.js\?v=4\.4\.7/);
  assert.match(view, /cdn\.jsdelivr\.net\/npm\/chart\.js@4\.4\.7\/dist\/chart\.umd\.min\.js/);
  assert.match(view, /pcm-dashboard\.js\?v=20260920-v9/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('dashboard deixa de falhar silenciosamente sem Chart.js', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /function ensureChartRuntime\(\)/);
  assert.match(js, /pcmChartRuntimeAlert/);
  assert.match(js, /Chart\.js indisponível/);
  assert.match(js, /function renderCharts\(\)\{\s*if\(!ensureChartRuntime\(\)\)return;/);
  assert.doesNotThrow(() => new Function(js));
});
