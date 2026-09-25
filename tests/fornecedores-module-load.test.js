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


test('views de fornecedores compilam sem erro de sintaxe EJS', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ejs = require('ejs');
  const dir = path.join(__dirname, '..', 'views', 'fornecedores');

  for (const name of ['index.ejs', 'form.ejs', 'profile.ejs']) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.doesNotThrow(() => ejs.compile(source, { filename: path.join(dir, name) }), name);
  }
});

test('perfil COMPRAS possui acesso e gestão de fornecedores no RBAC', () => {
  const { ACCESS } = require('../config/rbac');
  assert.ok(ACCESS.fornecedores.includes('COMPRAS'));
  assert.ok(ACCESS.fornecedores_manage.includes('COMPRAS'));
});
