const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('período da confiabilidade aceita datas ISO reais e não regex escapada em dobro', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');

  assert.ok(service.includes("const start = /^\\d{4}-\\d{2}-\\d{2}$/.test(startRaw)"));
  assert.ok(service.includes("const end = /^\\d{4}-\\d{2}-\\d{2}$/.test(endRaw)"));
  assert.ok(!service.includes("const start = /^\\\\d{4}"));
  assert.ok(!service.includes("const end = /^\\\\d{4}"));
  assert.ok(service.includes("const totalPossibleHours = bounds.hours * equipmentCount"));
  assert.ok(service.includes("availabilityAllowed = mttrAllowed && totalPossibleHours > 0"));
  assert.match(service, /_test: \{ parseSqlDate, periodBounds, periodHours \}/);
});

test('timezone explícito é reconhecido sem duplicar sufixo UTC', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');

  assert.ok(service.includes("/(?:Z|[+-]\\d{2}:?\\d{2})$/"));
  assert.ok(!service.includes("/(?:Z|[+-]\\\\d{2}:?\\\\d{2})$/"));
});

test('Excel da Diretoria usa a mesma camada executiva do painel e PDF', () => {
  const routes = read('modules/diretoria/diretoria.routes.js');
  const controller = read('modules/diretoria/diretoria.controller.js');

  assert.match(routes, /\/manutencao\/excel'[\s\S]*ctrl\.manutencaoExcel/);
  assert.doesNotMatch(routes, /pcmCtrl\.dashboardExcel/);
  assert.match(controller, /function manutencaoExcel\(req, res\)/);
  assert.match(controller, /manutencaoExecutivaService\.getDashboard\(req\.query/);
  assert.match(controller, /tableHtml\('Confiabilidade', \[dashboard\.confiabilidade \|\| \{\}\]\)/);
  assert.match(controller, /tableHtml\('Custos por equipamento', dashboard\.custos\?\.byEquipment \|\| \[\]\)/);
});

test('painel gerencial continua usando custo consumido e confiabilidade real', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  const js = read('public/js/pcm-dashboard.js');

  assert.match(view, /Custo real consumido por equipamento/);
  assert.match(view, /Consumido no período/);
  assert.match(view, /MTBF/);
  assert.match(view, /MTTR/);
  assert.match(view, /Disponibilidade/);
  assert.match(js, /x=>x\.consumido_centavos/);
  assert.match(js, /label:'Custo consumido'/);
  assert.match(js, /function renderReliability/);
  assert.doesNotThrow(() => new Function(js));
});
