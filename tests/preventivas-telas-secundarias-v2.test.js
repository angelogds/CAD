const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('nova preventiva preserva campos, endpoint e pré-seleção por equipamento', () => {
  const controller = read('modules/preventivas/preventivas.controller.js');
  const view = read('views/preventivas/nova.ejs');

  assert.match(controller, /equipamentoSelecionadoId = Number\(req\.query\?\.equipamento_id/);
  assert.match(view, /action="\/preventivas"/);
  assert.match(view, /name="equipamento_id"/);
  assert.match(view, /name="titulo"/);
  assert.match(view, /name="tipo_preventiva"/);
  assert.match(view, /name="criticidade"/);
  assert.match(view, /name="data_prevista"/);
  assert.match(view, /name="frequencia_tipo"/);
  assert.match(view, /name="frequencia_valor"/);
  assert.match(view, /name="observacao"/);
  assert.match(view, /Number\(equipamentoSelecionadoId \|\| 0\) === Number\(e\.id\)/);
});

test('telas secundárias usam design compartilhado sem alterar painel principal', () => {
  const nova = read('views/preventivas/nova.ejs');
  const programadas = read('views/preventivas/programadas.ejs');
  const eleger = read('views/preventivas/eleger-mecanico.ejs');

  for (const source of [nova, programadas, eleger]) {
    assert.match(source, /preventivas-form\.css\?v=20260919-p3/);
    assert.match(source, /preventive-secondary-page/);
    assert.match(source, /ui-btn/);
  }

  const index = read('views/preventivas/index.ejs');
  assert.match(index, /preventivas-index\.css/);
});

test('programadas preserva ações protegidas e fluxo de geração/OS', () => {
  const routes = read('modules/preventivas/preventivas.routes.js');
  const view = read('views/preventivas/programadas.ejs');

  assert.match(routes, /"\/programadas\/gerar"[\s\S]*requireRole\(ACCESS\.preventivas_manage\)/);
  assert.match(routes, /"\/programadas\/lancar-os-segunda"[\s\S]*requireRole\(ACCESS\.preventivas_manage\)/);
  assert.match(view, /action="\/preventivas\/programadas\/gerar"/);
  assert.match(view, /action="\/preventivas\/programadas\/lancar-os-segunda"/);
  assert.match(view, /Gerar programação semanal/);
  assert.match(view, /Lançar OS da segunda-feira/);
  assert.match(view, /confirm\(/);
});

test('eleição de mecânicos mantém validação de disponibilidade e IDs distintos', () => {
  const controller = read('modules/preventivas/preventivas.controller.js');
  const service = read('modules/preventivas/preventivas.service.js');
  const view = read('views/preventivas/eleger-mecanico.ejs');

  assert.match(controller, /service\.listColaboradoresParaPreventiva\(\)/);
  assert.match(controller, /resumoDisponibilidade/);
  assert.match(service, /validarColaboradorPreventivaDisponivel/);
  assert.match(service, /Selecione colaboradores diferentes para Mecânico 1 e Mecânico 2/);
  assert.match(view, /data-disponivel/);
  assert.match(view, /indisponivel/);
  assert.match(view, /mec1\.value === mec2\.value/);
  assert.match(view, /name="mecanico_1_id"/);
  assert.match(view, /name="mecanico_2_id"/);
});

test('RBAC das preventivas secundárias permanece preventivas_manage', () => {
  const routes = read('modules/preventivas/preventivas.routes.js');

  for (const route of [
    '/nova',
    '/eleger-mecanico',
    '/programadas',
  ]) {
    assert.ok(routes.includes(`"${route}"`));
  }
  const matches = routes.match(/requireRole\(ACCESS\.preventivas_manage\)/g) || [];
  assert.ok(matches.length >= 7);
});

test('CSS secundário é responsivo e não redefine o dashboard principal', () => {
  const css = read('public/css/preventivas-form.css');

  assert.match(css, /\.preventive-secondary-page/);
  assert.match(css, /\.preventive-secondary-table td::before/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.doesNotMatch(css, /\.preventive-kpis\s*\{/);
  assert.doesNotMatch(css, /\.preventive-toolbar\s*\{/);
});
