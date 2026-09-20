const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('gráficos modernos configuram tipografia interação e tooltips executivos', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /Chart\.defaults\.font\.family/);
  assert.match(js, /interaction:\{mode:horizontal\?'nearest':'index',intersect:false\}/);
  assert.match(js, /cornerRadius:12/);
  assert.match(js, /boxPadding:5/);
  assert.match(js, /hoverBorderWidth:2/);
});

test('donuts exibem total central e percentual no tooltip', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /const centerTextPlugin=/);
  assert.match(js, /id:'pcmCenterText'/);
  assert.match(js, /plugins:\[centerTextPlugin\]/);
  assert.match(js, /pct\.toFixed\(1\)/);
  assert.match(js, /cutout:'68%'/);
});

test('linhas e barras usam acabamento visual moderno sem perder drill-down', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /cubicInterpolationMode:'monotone'/);
  assert.match(js, /pointRadius:0/);
  assert.match(js, /borderRadius:9/);
  assert.match(js, /decorateChartPanel\(id/);
  assert.match(js, /interactive:Boolean\(opts\.links\?\.some\(Boolean\)\)/);
});

test('CSS cria painéis modernos badges e leitura responsiva', () => {
  const css = read('public/css/pcm-dashboard.css');
  assert.match(css, /\.pcm-chart-panel--modern/);
  assert.match(css, /\.pcm-chart-modern-meta/);
  assert.match(css, /\.pcm-chart-badge\.is-interactive/);
  assert.match(css, /\.pcm-analytics-intro/);
  assert.match(css, /radial-gradient\(circle at 88% 4%/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*\.pcm-chart\{height:245px/);
});

test('view publica a área gráfica executiva e atualiza cache dos assets', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(view, /Indicadores em gráficos interativos/);
  assert.match(view, /pcm-analytics-chip/);
  assert.match(view, /pcm-dashboard\.css\?v=20260920-v6/);
  assert.match(view, /pcm-dashboard\.js\?v=20260920-v6/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('javascript do dashboard moderno permanece sintaticamente válido', () => {
  assert.doesNotThrow(() => new Function(read('public/js/pcm-dashboard.js')));
});
