const test = require('node:test');
const assert = require('node:assert/strict');

const { ACCESS } = require('../config/rbac');

test('preventivas_view replica perfis com acesso ao painel_operacional', () => {
  assert.deepEqual(ACCESS.preventivas_view, ACCESS.painel_operacional);
});
