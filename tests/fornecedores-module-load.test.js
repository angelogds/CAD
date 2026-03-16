const test = require('node:test');
const assert = require('node:assert/strict');

test('fornecedores routes module loads', () => {
  const routes = require('../modules/fornecedores/fornecedores.routes');
  assert.ok(routes);
  assert.equal(typeof routes.use, 'function');
});

test('rbac has fornecedores access policy', () => {
  const { ACCESS } = require('../config/rbac');
  assert.ok(Array.isArray(ACCESS.fornecedores));
  assert.ok(ACCESS.fornecedores.length > 0);
});
