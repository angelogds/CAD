const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('confiabilidade executiva usa somente falhas e paradas rastreadas', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');

  assert.match(service, /function getReliabilityIndicators\(filtros = \{}, qualidade = \{}\)/);
  assert.match(service, /JOIN pcm_falhas pf ON pf\.os_id=o\.id/);
  assert.match(service, /pf\.inicio_parada_em,pf\.fim_parada_em/);
  assert.match(service, /UPPER\(COALESCE\(o\.tipo,''\)\)='CORRETIVA'/);
  assert.match(service, /mtbfAllowed = equipamentoCoverage >= 95 && classificationCoverage >= 85/);
  assert.match(service, /mttrAllowed = equipamentoCoverage >= 95 && stopCoverage >= 85/);
  assert.match(service, /availabilityAllowed = mttrAllowed && totalPossibleHours > 0/);
});

test('MTBF, MTTR e disponibilidade não recebem valor quando a base é insuficiente', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');

  assert.match(service, /mtbf_horas: null/);
  assert.match(service, /mttr_horas: null/);
  assert.match(service, /disponibilidade_pct: null/);
  assert.match(service, /status: 'DADOS_INSUFICIENTES'/);
  assert.match(service, /mtbfHours === null \? null/);
  assert.match(service, /mttrHours === null \? null/);
  assert.match(service, /availability === null \? null/);
});

test('dashboard executivo prioriza custo consumido e mantém contexto financeiro', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');
  const view = read('views/pcm/dashboard-gerencial.ejs');
  const js = read('public/js/pcm-dashboard.js');

  assert.match(service, /custo_consumido_centavos/);
  assert.match(service, /custo_comprado_centavos/);
  assert.match(service, /custo_recebido_centavos/);
  assert.match(view, /Custo real consumido na manutenção/);
  assert.match(view, /Consumido no período/);
  assert.match(view, /Compras não consumidas não entram neste ranking/);
  assert.match(js, /custos\.map\(x=>x\.consumido_centavos\)/);
  assert.match(js, /label:'Custo consumido'/);
  assert.match(js, /label:'Consumido',data:meses\.map\(x=>x\.consumido_centavos\)/);
});

test('interface mostra confiabilidade com atualização dinâmica e responsiva', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  const js = read('public/js/pcm-dashboard.js');
  const css = read('public/css/pcm-dashboard.css');

  for (const token of ['mtbf_dias','mttr_horas','disponibilidade_pct','horas_parada_registrada','data-reliability-status']) {
    assert.ok(view.includes(token), `indicador ausente: ${token}`);
  }
  assert.match(js, /function renderReliability/);
  assert.match(js, /renderReliability\(\)/);
  assert.match(css, /\.pcm-reliability-kpis\{display:grid;grid-template-columns:repeat\(4/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*\.pcm-reliability-kpis\{grid-template-columns:1fr\}/);
  new Function(js);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('PDF executivo leva confiabilidade e custo real consumido', () => {
  const controller = read('modules/diretoria/diretoria.controller.js');

  assert.match(controller, /const reliability = dashboard\.confiabilidade/);
  assert.match(controller, /indicador: 'MTBF'/);
  assert.match(controller, /indicador: 'MTTR'/);
  assert.match(controller, /indicador: 'Disponibilidade'/);
  assert.match(controller, /CONSUMIDO NO PERÍODO/);
  assert.match(controller, /consumido: moneyCents\(item\.consumido_centavos\)/);
  assert.match(controller, /Custo real consumido considera apenas baixas físicas do estoque/);
});

test('Excel da Diretoria usa a camada executiva enriquecida e preserva RBAC', () => {
  const routes = read('modules/diretoria/diretoria.routes.js');
  const controller = read('modules/diretoria/diretoria.controller.js');

  assert.match(routes, /router\.get\('\/manutencao\/excel', requireLogin, requireRole\(DIRETORIA_MANUTENCAO\), ctrl\.manutencaoExcel\)/);
  assert.doesNotMatch(routes, /pcmCtrl\.dashboardExcel/);
  assert.match(controller, /function manutencaoExcel\(req, res\)/);
  assert.match(controller, /manutencaoExecutivaService\.getDashboard\(req\.query/);
  assert.match(controller, /tableHtml\('Confiabilidade'/);
  assert.match(controller, /tableHtml\('Custos por equipamento'/);
  assert.match(controller, /module\.exports = \{ index, manutencao, manutencaoDados, manutencaoExcel/);
});

test('lote de indicadores não cria migration nem altera dados de manutenção', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');
  assert.doesNotMatch(service, /CREATE TABLE|ALTER TABLE|DROP TABLE|DELETE FROM|UPDATE\s+os\s+SET|INSERT INTO/i);
});
