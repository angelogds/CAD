const test = require('node:test');
const assert = require('node:assert/strict');

const { ACCESS } = require('../config/rbac');

test('ACCESS exposes compras/solicitacoes/almoxarifado granular keys', () => {
  assert.ok(Array.isArray(ACCESS.compras_read) && ACCESS.compras_read.length > 0);
  assert.ok(Array.isArray(ACCESS.compras_manage) && ACCESS.compras_manage.length > 0);
  assert.ok(Array.isArray(ACCESS.solicitacoes_read) && ACCESS.solicitacoes_read.length > 0);
  assert.ok(Array.isArray(ACCESS.solicitacoes_create) && ACCESS.solicitacoes_create.length > 0);
  assert.ok(Array.isArray(ACCESS.almoxarifado_read) && ACCESS.almoxarifado_read.length > 0);
  assert.ok(Array.isArray(ACCESS.almoxarifado_manage) && ACCESS.almoxarifado_manage.length > 0);
  assert.ok(Array.isArray(ACCESS.diretoria_aprovacao) && ACCESS.diretoria_aprovacao.length > 0);
});
