const test = require('node:test');
const assert = require('node:assert/strict');

const { ACCESS, ROLE } = require('../config/rbac');

test('preventivas_view não inclui perfis de produção e mantém acesso operacional via painel', () => {
  assert.ok(!ACCESS.preventivas_view.includes(ROLE.PRODUCAO));
  assert.ok(!ACCESS.preventivas_view.includes(ROLE.ENCARREGADO_PRODUCAO));
  assert.ok(ACCESS.painel_operacional.includes(ROLE.PRODUCAO));
  assert.ok(ACCESS.painel_operacional.includes(ROLE.ENCARREGADO_PRODUCAO));
});
