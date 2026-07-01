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

test('limpeza geral de testes é exclusiva do backend admin e não apaga OS ou colaboradores', () => {
  assert.match(service, /function limparHorasExtrasTeste\(usuarioAdmin\)/);
  assert.match(service, /DELETE FROM escala_banco_horas_movimentos WHERE hora_extra_id IS NOT NULL/);
  assert.match(service, /DELETE FROM escala_horas_extras/);
  assert.doesNotMatch(service, /DELETE FROM os\b/);
  assert.doesNotMatch(service, /DELETE FROM colaboradores\b/);
});

test('rotas e controller expõem exclusão individual e limpeza de testes', () => {
  assert.match(routes, /\/hora-extra\/:id\/excluir/);
  assert.match(routes, /\/admin\/horas-extras\/limpar-testes/);
  assert.match(controller, /exports\.apagarHoraExtra/);
  assert.match(controller, /exports\.limparHorasExtrasTeste/);
});

test('frontend mostra botões de apagar somente quando permitido e exige confirmação', () => {
  assert.match(view, /if \(canDeleteHorasExtras\)/);
  assert.match(view, /Apagar/);
  assert.match(view, /Limpar horas extras de teste/);
  assert.match(view, /Tem certeza que deseja apagar este lançamento de hora extra/);
  assert.match(view, /Essa ação limpará os lançamentos de horas extras/);
});
