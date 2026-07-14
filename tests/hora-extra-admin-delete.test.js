const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const service = readFileSync('modules/escala/escala.service.js', 'utf8');
const controller = readFileSync('modules/escala/escala.controller.js', 'utf8');
const routes = readFileSync('modules/escala/escala.routes.js', 'utf8');
const view = readFileSync('views/escala/hora-extra-pendentes.ejs', 'utf8');

test('exclusão de hora extra é validada como ADMIN no backend e remove movimento do banco', () => {
  assert.match(service, /Apenas administradores podem apagar lançamentos de hora extra\./);
  assert.match(service, /function apagarHoraExtra\(id, usuarioAdmin\)/);
  assert.match(service, /DELETE FROM escala_banco_horas_movimentos WHERE hora_extra_id=\?/);
  assert.match(service, /DELETE FROM escala_horas_extras WHERE id=\?/);
});

test('limpeza geral de testes foi removida da tela, rotas, controller e service', () => {
  assert.doesNotMatch(service, /function limparHorasExtrasTeste\(usuarioAdmin\)/);
  assert.doesNotMatch(routes, /\/admin\/horas-extras\/limpar-testes/);
  assert.doesNotMatch(controller, /exports\.limparHorasExtrasTeste/);
  assert.doesNotMatch(view, /Limpar horas extras de teste/);
});

test('rotas e controller expõem exclusão individual e aprovação de hora extra', () => {
  assert.match(routes, /\/hora-extra\/:id\/excluir/);
  assert.match(routes, /\/hora-extra\/:id\/aprovar/);
  assert.match(controller, /exports\.apagarHoraExtra/);
  assert.match(controller, /exports\.aprovarHoraExtra/);
});

test('frontend mostra aprovação para pendentes e apagar somente quando permitido', () => {
  assert.match(view, /String\(h\.status \|\| ''\) === 'PENDENTE_APROVACAO'/);
  assert.match(view, /Aprovar/);
  assert.match(view, /creditar no banco de horas do colaborador/);
  assert.match(view, /if \(canDeleteHorasExtras\)/);
  assert.match(view, /Apagar/);
  assert.match(view, /Tem certeza que deseja apagar este lançamento de hora extra/);
});
