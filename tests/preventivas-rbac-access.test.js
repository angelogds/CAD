const test = require('node:test');
const assert = require('node:assert/strict');

const { ACCESS, ROLE } = require('../config/rbac');

test('preventivas_view não inclui PRODUCAO e mantém acesso operacional via painel', () => {
  assert.ok(!ACCESS.preventivas_view.includes(ROLE.PRODUCAO));
  assert.ok(ACCESS.painel_operacional.includes(ROLE.PRODUCAO));
});
