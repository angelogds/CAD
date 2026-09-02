const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const operational = require('../modules/pcm/pcm.operational.service');

test('PCM operational filters use safe supported ranges', () => {
  assert.deepEqual(operational.resolveFilters({ periodo_dias: 90, setor: 'Caldeiras', sla_dias: 10 }), {
    periodo_dias: 90,
    setor: 'Caldeiras',
    prioridade: '',
    sla_dias: 10,
  });
  assert.equal(operational.resolveFilters({ periodo_dias: 999 }).periodo_dias, 30);
  assert.equal(operational.resolveFilters({ sla_dias: 999 }).sla_dias, 60);
});

test('PCM local analysis is deterministic and explains missing reliability data', () => {
  const result = operational.buildLocalAnalysis({
    filtros: { periodo_dias: 30, sla_dias: 7 },
    cards: {
      backlog: 8, acima_sla: 2, preventivas_vencidas: 1, aguardando_material: 3,
      preventiva_pct: 40, mtbf_amostras: 0, mttr_horas: null,
    },
  });
  assert.match(result.resumo, /Backlog atual de 8 OS/);
  assert.ok(result.prioridades.some((item) => item.titulo.includes('SLA')));
  assert.ok(result.observacoes_confiabilidade.some((item) => item.includes('MTBF indisponível')));
});

test('PCM overview no longer mutates data on GET and exposes explicit actions', () => {
  const controller = fs.readFileSync('modules/pcm/pcm.controller.js', 'utf8');
  const indexBody = controller.slice(controller.indexOf('function index'), controller.indexOf('function planejamento'));
  assert.ok(!indexBody.includes('processarAutomacaoOS'));
  assert.ok(!indexBody.includes('atualizarScoresRiscoEquipamentos'));
  assert.ok(controller.includes('function executarAutomacao'));
  assert.ok(controller.includes('function atualizarIndicadores'));

  const routes = fs.readFileSync('modules/pcm/pcm.routes.js', 'utf8');
  assert.ok(routes.includes('/executar-automacao'));
  assert.ok(routes.includes('/analisar-ia'));
});

test('PCM AI uses Structured Outputs and has a local fallback', () => {
  const service = fs.readFileSync('modules/pcm/pcm.operational.service.js', 'utf8');
  assert.ok(service.includes('askJSONSchemaStrict'));
  assert.ok(service.includes("schemaName: 'pcm_analise_operacional'"));
  assert.ok(service.includes("origem: 'LOCAL'"));
  assert.ok(service.includes('Não autorize nem execute ações'));
});

test('Weekly scheduling is persisted and fake placeholders were removed', () => {
  const migration = fs.readFileSync('database/migrations/185_pcm_operacional_real.js', 'utf8');
  assert.ok(migration.includes('pcm_programacao_semanal'));
  assert.ok(migration.includes('pcm_ai_analises'));

  const view = fs.readFileSync('views/pcm/programacao-semanal.ejs', 'utf8');
  assert.ok(view.includes('Agenda da equipe'));
  assert.ok(view.includes('data_programada'));
  assert.ok(!view.includes('TODO:'));
  assert.ok(!view.includes('Mecânico 1'));
});

test('PCM main view uses the new operational visual system', () => {
  const view = fs.readFileSync('views/pcm/index.ejs', 'utf8');
  const sharedStyles = fs.readFileSync('views/pcm/partials/internal-styles.ejs', 'utf8');
  const css = fs.readFileSync('public/css/pcm-operational.css', 'utf8');
  assert.ok(view.includes("include('partials/internal-styles')"));
  assert.ok(sharedStyles.includes('/css/pcm-operational.css'));
  assert.ok(view.includes('Acima do SLA interno'));
  assert.ok(view.includes('Prioridades para decisão'));
  assert.ok(view.includes('Recomendações não executam alterações automaticamente'));
  assert.ok(css.includes('.pcm-op-kpis'));
  assert.ok(css.includes('.pcm-op-btn:hover'));
});
