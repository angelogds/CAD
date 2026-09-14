const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('camada executiva reaproveita o PCM sem alterar o serviço operacional', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');
  assert.match(service, /require\('\.\.\/pcm\/pcm\.service'\)/);
  assert.match(service, /pcmService\.getDashboardGerencial\(query, userId\)/);
  assert.doesNotMatch(service, /CREATE TABLE|ALTER TABLE|DROP TABLE|DELETE FROM os|UPDATE os SET/i);
});

test('backlog executivo considera OS antigas ainda pendentes e separa aging', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');
  assert.match(service, /date\(o\.opened_at\) <= date\(@data_final\)/);
  assert.match(service, /NOT IN \$\{CLOSED_STATUSES\}/);
  assert.match(service, /NOT IN \$\{CANCELLED_STATUSES\}/);
  assert.match(service, /ate_7/);
  assert.match(service, /de_8_30/);
  assert.match(service, /de_31_60/);
  assert.match(service, /acima_60/);
  assert.match(service, /backlog_acima_30_dias/);
});

test('reincidência usa duas ou mais corretivas por equipamento sem fingir modo de falha', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(service, /Number\(item\.falhas \|\| 0\) >= 2/);
  assert.match(service, /repeticoes_apos_primeira/);
  assert.match(service, /reincidencia_corretiva_pct/);
  assert.match(view, /Não substitui análise de modo de falha/);
});

test('qualidade dos dados mede rastreabilidade antes de liberar confiabilidade oficial', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(service, /pcm_falhas/);
  assert.match(service, /inicio_parada_em/);
  assert.match(service, /fim_parada_em/);
  assert.match(service, /os_com_equipamento_pct/);
  assert.match(service, /encerramento_com_data_pct/);
  assert.match(service, /corretivas_classificadas_pct/);
  assert.match(service, /paradas_com_intervalo_pct/);
  assert.match(view, /MTBF, MTTR e disponibilidade/);
  assert.match(view, /continuam como “dados insuficientes”/);
});

test('rota de atualização da Diretoria usa a camada executiva e preserva RBAC', () => {
  const routes = read('modules/diretoria/diretoria.routes.js');
  const controller = read('modules/diretoria/diretoria.controller.js');
  assert.match(routes, /router\.get\('\/manutencao\/dados', requireLogin, requireRole\(DIRETORIA_MANUTENCAO\), ctrl\.manutencaoDados\)/);
  assert.match(controller, /manutencaoExecutivaService\.getDashboard\(req\.query/);
  assert.doesNotMatch(controller, /safeMaintenanceSummary|periodo: 'mes_atual'/);
});

test('interface executiva mostra aging reincidência e qualidade com atualização dinâmica', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  const js = read('public/js/pcm-dashboard.js');
  const css = read('public/css/pcm-dashboard.css');
  for (const token of ['backlog_os_atual','backlog_acima_30_dias','reincidencia_corretiva_pct','qualidade_dados_pct','chartBacklogIdade','chartReincidencia','qualityPendencias']) {
    assert.ok(view.includes(token), `token ausente na view: ${token}`);
  }
  assert.match(js, /rows\('backlog_idade'\)/);
  assert.match(js, /rows\('reincidencia_corretiva'\)/);
  assert.match(js, /function renderQuality/);
  assert.match(css, /\.pcm-quality-grid/);
  const mobile560 = css.slice(css.indexOf('@media(max-width:560px)'));
  assert.match(mobile560, /\.pcm-quality-grid(?:,[^{]+)?\{grid-template-columns:1fr\}/);
});
