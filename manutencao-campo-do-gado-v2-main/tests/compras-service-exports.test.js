const test = require('node:test');
const assert = require('node:assert/strict');

test('compras service exports anexo helpers', () => {
  const service = require('../modules/compras/compras.service');
  assert.equal(typeof service.salvarAnexo, 'function');
  assert.equal(typeof service.listarAnexos, 'function');
  assert.equal(typeof service.getAnexo, 'function');
  assert.equal(typeof service.deletarAnexo, 'function');
});

