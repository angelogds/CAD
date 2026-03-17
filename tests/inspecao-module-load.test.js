const test = require('node:test');
const assert = require('node:assert/strict');

test('inspecao controller exports required handlers', () => {
  const ctrl = require('../modules/inspecao/inspecao.controller');
  assert.equal(typeof ctrl.index, 'function');
  assert.equal(typeof ctrl.viewMonth, 'function');
  assert.equal(typeof ctrl.recalculate, 'function');
  assert.equal(typeof ctrl.editStatus, 'function');
  assert.equal(typeof ctrl.saveNC, 'function');
  assert.equal(typeof ctrl.exportPDF, 'function');
  assert.equal(typeof ctrl.exportXLS, 'function');
});

test('inspecao service exports sync and recalculate helpers', () => {
  const service = require('../modules/inspecao/inspecao.service');
  assert.equal(typeof service.getOrCreateInspecao, 'function');
  assert.equal(typeof service.computeGrade, 'function');
  assert.equal(typeof service.recalculate, 'function');
  assert.equal(typeof service.syncFromOS, 'function');
  assert.equal(typeof service.listNC, 'function');
});

test('inspecao routes module loads', () => {
  const routes = require('../modules/inspecao/inspecao.routes');
  assert.ok(routes);
  assert.equal(typeof routes.use, 'function');
});


test('inspecao service normaliza ações com compatibilidade legada', () => {
  const service = require('../modules/inspecao/inspecao.service');
  const result = service.normalizarAcoesInspecao({
    acao_corretiva: 'troca de rolamento',
    acao_preventiva: 'incluir inspeção semanal',
  });

  assert.equal(result.legado.acao_corretiva, 'troca de rolamento');
  assert.equal(result.legado.acao_preventiva, 'incluir inspeção semanal');
  assert.equal(result.canonico.acao_corretiva, 'incluir inspeção semanal');
  assert.equal(result.canonico.acao_preventiva, 'troca de rolamento');
});
