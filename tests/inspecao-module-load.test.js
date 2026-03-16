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
