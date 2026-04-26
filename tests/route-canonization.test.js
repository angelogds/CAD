const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { OFFICIAL_ROUTES, COMPATIBILITY_ALIASES } = require('../config/routes');

test('rotas oficiais expõem módulos críticos da estabilização', () => {
  assert.equal(OFFICIAL_ROUTES.os, '/os');
  assert.equal(OFFICIAL_ROUTES.dashboard, '/dashboard');
  assert.equal(OFFICIAL_ROUTES.tv, '/tv');
  assert.equal(OFFICIAL_ROUTES.inspecao, '/inspecao');
  assert.equal(OFFICIAL_ROUTES.compras, '/compras');
  assert.equal(OFFICIAL_ROUTES.almoxarifado, '/almoxarifado');
  assert.equal(OFFICIAL_ROUTES.estoque, '/estoque');
  assert.equal(OFFICIAL_ROUTES.pcm, '/pcm');
});

test('alias legado de ordens de serviço permanece ativo', () => {
  const osAlias = COMPATIBILITY_ALIASES.find((entry) => entry.from === '/ordens-servico');
  assert.ok(osAlias, 'alias /ordens-servico deve existir');
  assert.equal(osAlias.to, '/os');
});

test('server usa registro centralizado de aliases de compatibilidade', () => {
  const serverContent = fs.readFileSync(require.resolve('../server'), 'utf8');
  assert.equal(serverContent.includes('registerCompatibilityAlias(app, alias.from, alias.to)'), true);
});
