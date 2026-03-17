const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canViewOSDetails,
  postCloseRedirectPath,
  OS_EXECUTION_ACCESS,
} = require('../modules/os/os.permissions');

test('produção pode executar fechamento, mas redireciona para painel quando não pode ver detalhes', () => {
  assert.equal(OS_EXECUTION_ACCESS.includes('PRODUCAO'), true);
  assert.equal(canViewOSDetails({ role: 'PRODUCAO' }), false);
  assert.equal(postCloseRedirectPath({ role: 'PRODUCAO' }), '/painel-operacional');
});

test('admin mantém acesso ao detalhe após fechamento', () => {
  assert.equal(canViewOSDetails({ role: 'ADMIN' }), true);
  assert.equal(postCloseRedirectPath({ role: 'ADMIN' }), null);
});

test('direcao/diretoria e outros perfis operacionais restritos redirecionam ao painel', () => {
  const restrictedRoles = ['DIRECAO', 'DIRETORIA', 'RH', 'ENCARREGADO_PRODUCAO', 'COMPRAS', 'ALMOXARIFADO'];
  restrictedRoles.forEach((role) => {
    assert.equal(canViewOSDetails({ role }), false);
    assert.equal(postCloseRedirectPath({ role }), '/painel-operacional');
  });
});
