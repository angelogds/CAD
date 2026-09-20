const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('confiabilidade usa falhas classificadas e intervalos reais de parada', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');

  assert.match(service, /function getReliabilityMetrics\(filtros = \{\}, qualidade = \{\}\)/);
  assert.match(service, /FROM pcm_falhas pf/);
  assert.match(service, /pf\.inicio_parada_em/);
  assert.match(service, /pf\.fim_parada_em/);
  assert.match(service, /tempo_parada_horas/);
  assert.match(service, /mtbf_horas/);
  assert.match(service, /mttr_horas/);
  assert.match(service, /disponibilidade_pct/);
});

test('indicadores de confiabilidade exigem cobertura e amostra mínima', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');

  assert.match(service, /intervalosValidosPct = percentage\(mttrSamples, rows\.length\)/);
  assert.match(service, /Number\(intervalosValidosPct \|\| 0\) >= 85/);
  assert.match(service, /mtbfSamples >= 2 && mttrSamples >= 2/);
  assert.match(service, /const publicado = classificacaoOk && paradaOk && equipamentoOk && amostraOk/);
  assert.match(service, /publicado \? mtbf : null/);
  assert.match(service, /publicado \? mttr : null/);
  assert.match(service, /publicado \? disponibilidade : null/);
});

test('dashboard executivo publica custo consumido sem perder compras e recebimentos', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');

  for (const key of [
    'custo_consumido_centavos',
    'custo_comprado_centavos',
    'custo_recebido_centavos',
    'custo_pendente_recebimento_centavos',
    'consumo_movimentos',
    'custos_equipamento',
    'custos_mes',
  ]) {
    assert.ok(service.includes(key), `indicador ausente: ${key}`);
  }
  assert.match(service, /confiabilidade_equipamento/);
});

test('interface mostra confiabilidade, parada e ranking por custo real', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  const js = read('public/js/pcm-dashboard.js');
  const css = read('public/css/pcm-dashboard.css');

  assert.match(view, /Confiabilidade operacional/);
  assert.match(view, /MTBF, MTTR e disponibilidade/);
  assert.match(view, /Disponibilidade estimada/);
  assert.match(view, /Tempo total de parada/);
  assert.match(view, /chartParadasEquipamentos/);
  assert.match(view, /Custo real consumido por equipamento/);
  assert.match(view, /Consumido na manutenção/);

  new Function(js);
  assert.match(js, /function renderReliability/);
  assert.match(js, /rows\('confiabilidade_equipamento'\)/);
  assert.match(js, /chartParadasEquipamentos/);
  assert.match(js, /custos\.map\(x=>x\.consumido_centavos\)/);
  assert.match(js, /meses\.map\(x=>x\.consumido_centavos\)/);

  assert.match(css, /\.pcm-reliability-kpis/);
  assert.match(css, /\.pcm-reliability-note/);
});

test('PDF e Excel da Diretoria usam a mesma camada executiva real', () => {
  const controller = read('modules/diretoria/diretoria.controller.js');
  const routes = read('modules/diretoria/diretoria.routes.js');

  assert.match(controller, /CONSUMIDO NA MANUTENÇÃO/);
  assert.match(controller, /title: 'Confiabilidade por equipamento'/);
  assert.match(controller, /function manutencaoExcel\(req, res\)/);
  assert.match(controller, /manutencaoExecutivaService\.getDashboard\(req\.query/);
  assert.match(controller, /tableHtml\('Confiabilidade por equipamento'/);
  assert.match(controller, /tableHtml\('Custos por equipamento'/);
  assert.match(routes, /router\.get\('\/manutencao\/excel',[\s\S]*ctrl\.manutencaoExcel\)/);
  assert.doesNotMatch(routes, /pcmCtrl\.dashboardExcel/);
});

test('camada executiva continua somente leitura e sem migration', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');

  assert.doesNotMatch(service, /CREATE TABLE|ALTER TABLE|DROP TABLE|DELETE FROM|UPDATE\s+\w+\s+SET|INSERT INTO/i);
});

test('dashboard gerencial continua compilando como EJS', () => {
  assert.doesNotThrow(() => ejs.compile(read('views/pcm/dashboard-gerencial.ejs')));
});
