const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('tracagem routes module loads', () => {
  const routes = require('../modules/tracagem/tracagem.routes');
  assert.ok(routes);
  assert.equal(typeof routes.use, 'function');
});

test('rbac has tracagem policies', () => {
  const { ACCESS } = require('../config/rbac');
  assert.ok(Array.isArray(ACCESS.tracagem_view));
  assert.ok(Array.isArray(ACCESS.tracagem_manage));
});

test('tracagem index exposes expanded calculator links', () => {
  const file = path.join(__dirname, '..', 'views', 'tracagem', 'index.ejs');
  const html = fs.readFileSync(file, 'utf8');
  ['quadrado-para-redondo', 'reducao-concentrica', 'semi-cilindro', 'boca-de-lobo-excentrica', 'boca-de-lobo-45-graus', 'boca-de-lobo-90-graus', 'mao-francesa'].forEach((slug) => {
    assert.match(html, new RegExp(`/tracagem/${slug}`));
  });
});
