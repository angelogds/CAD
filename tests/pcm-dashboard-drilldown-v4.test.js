const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('dashboard gerencial preserva filtros ao criar drill-down', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /function dashboardHref\(extra=\{\}\)/);
  assert.match(js, /Object\.entries\(state\.data\?\.filtros\|\|\{\}\)/);
  assert.match(js, /state\.lastQuery\.entries\(\)/);
  assert.match(js, /params\.delete\('page'\)/);
  assert.match(js, /endpoints\.base/);
});

test('gráficos executivos oferecem drill-down por equipamento tipo e status', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /links:falhas\.map\(x=>x\.equipamento_id\?dashboardHref/);
  assert.match(js, /links:reinc\.map\(x=>x\.equipamento_id\?dashboardHref/);
  assert.match(js, /links:custos\.map\(x=>x\.equipamento_id\?dashboardHref/);
  assert.match(js, /dashboardHref\(\{tipo_manutencao:String\(x\.tipo\)\.toUpperCase\(\)\}\)/);
  assert.match(js, /dashboardHref\(\{status:String\(x\.status\)\.toUpperCase\(\)\}\)/);
});

test('equipamentos em atenção permitem analisar no próprio dashboard', () => {
  const js = read('public/js/pcm-dashboard.js');
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(js, />Analisar<\/a>/);
  assert.match(js, /dashboardHref\(\{equipamento_id:equipamentoId\}\)/);
  assert.match(view, /<th>Ação<\/th>/);
  assert.match(view, /Clique em uma barra para analisar o equipamento/);
  assert.match(view, /Clique em uma fatia para filtrar o painel pelo tipo/);
});

test('javascript e EJS do dashboard continuam sintaticamente válidos', () => {
  assert.doesNotThrow(() => new Function(read('public/js/pcm-dashboard.js')));
  assert.doesNotThrow(() => ejs.compile(read('views/pcm/dashboard-gerencial.ejs')));
});
