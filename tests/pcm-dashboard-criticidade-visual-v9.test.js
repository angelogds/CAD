const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('escala de criticidade progride do amarelo claro ao vermelho', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /risk1:'#f8e7a1'/);
  assert.match(js, /risk2:'#f4c84e'/);
  assert.match(js, /risk3:'#f39a3e'/);
  assert.match(js, /risk4:'#d94b47'/);
  assert.match(js, /function criticalityBarColor\(value,isCritical=false\)/);
  assert.match(js, /if\(isCritical\|\|total>=4\)return COLORS\.risk4/);
});

test('gráficos de falhas exibem nome e valor diretamente nas barras', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /id:'pcmBarDirectLabels'/);
  assert.match(js, /directLabels:falhas\.map\(x=>x\.nome\)/);
  assert.match(js, /directTextColors:falhasTextColors/);
  assert.match(js, /ctx\.fillText\(new Intl\.NumberFormat\('pt-BR'\)\.format\(value\)/);
});

test('ocorrência crítica força vermelho e preserva drill-down', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /Number\(x\.falhas_criticas\)>0/);
  assert.match(js, /includes\('CRIT'\)/);
  assert.match(js, /dashboardHref\(\{equipamento_id:x\.equipamento_id\}\)/);
});

test('reincidência usa o mesmo padrão visual de barras', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /reincColors=reinc\.map\(x=>criticalityBarColor/);
  assert.match(js, /directLabels:reinc\.map\(x=>x\.nome\)/);
});

test('view e CSS publicam legenda responsiva de criticidade', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  const css = read('public/css/pcm-dashboard.css');
  assert.match(view, /pcm-criticality-scale/);
  assert.match(view, /4\+ ou crítica/);
  assert.match(view, /pcm-dashboard\.css\?v=20260920-v7/);
  assert.match(view, /pcm-dashboard\.js\?v=20260920-v10/);
  assert.match(css, /\.pcm-criticality-scale/);
  assert.match(css, /\.risk-4\{background:#d94b47\}/);
});

test('javascript permanece sintaticamente válido', () => {
  assert.doesNotThrow(() => new Function(read('public/js/pcm-dashboard.js')));
});
