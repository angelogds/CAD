const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { resolveSessionSecret } = require('../config/runtime-security');

test('SESSION_SECRET configurada é preservada', () => {
  assert.equal(resolveSessionSecret({ SESSION_SECRET: 'segredo-real', NODE_ENV: 'production' }), 'segredo-real');
});

test('produção sem SESSION_SECRET falha fechado', () => {
  assert.throws(
    () => resolveSessionSecret({ NODE_ENV: 'production' }),
    (err) => err?.code === 'SESSION_SECRET_REQUIRED'
  );
});

test('runtime sem modo explícito também exige SESSION_SECRET', () => {
  assert.throws(
    () => resolveSessionSecret({}),
    (err) => err?.code === 'SESSION_SECRET_REQUIRED'
  );
});

test('development/test recebem segredo efêmero e não usam dev-secret fixo', () => {
  const devSecret = resolveSessionSecret({ NODE_ENV: 'development' });
  const testSecret = resolveSessionSecret({ NODE_ENV: 'test' });
  assert.match(devSecret, /^dev-[a-f0-9]{64}$/);
  assert.match(testSecret, /^dev-[a-f0-9]{64}$/);
  assert.notEqual(devSecret, testSecret);
});

test('server e views não possuem fallback RBAC permissivo', () => {
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'views/dashboard/index.ejs'), 'utf8');
  const sidebar = fs.readFileSync(path.join(root, 'views/partials/sidebar.ejs'), 'utf8');

  assert.match(server, /let canAccessModule = \(\) => false;/);
  assert.doesNotMatch(server, /canAccessModule = \(\) => true/);
  assert.doesNotMatch(server, /seguindo permissivo/);
  assert.match(dashboard, /canAccessModule=\(\)=>false/);
  assert.match(sidebar, /return false;/);
});

test('workflow torna a suíte completa bloqueante', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/node-tests.yml'), 'utf8');
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.match(workflow, /name: Suíte completa - regressão/);
});
