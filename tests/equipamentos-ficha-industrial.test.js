const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const view = fs.readFileSync('views/equipamentos/show.ejs', 'utf8');
const css = fs.readFileSync('public/css/equipamentos-show.css', 'utf8');
const service = fs.readFileSync('modules/equipamentos/equipamentos.service.js', 'utf8');
const controller = fs.readFileSync('modules/equipamentos/equipamentos.controller.js', 'utf8');

test('ficha industrial mantém integrações, RBAC destrutivo e estados reais', () => {
  for (const integration of ['/pdf', '/qrcode', "'historico'", "'pecas'", "'documentos'", "'tracagem'", "'desenho-tecnico'"]) {
    assert.ok(view.includes(integration), `integração ausente: ${integration}`);
  }
  assert.match(view, /if\(isAdmin\)/);
  assert.match(view, /riscoFalha\.score_risco/);
  assert.match(view, /dashboard\.osAtivas/);
  assert.doesNotMatch(view, /BOM\/02|BOMBA CALDEIRA 2|THEBE/);
});

test('métricas gerenciais vêm do service e não de SQL no EJS', () => {
  assert.match(service, /function getEquipmentDashboard/);
  assert.match(service, /OPEN_OS_SQL/);
  assert.match(service, /proximaPreventiva/);
  assert.match(controller, /service\.getEquipmentDashboard\(id\)/);
  assert.doesNotMatch(view, /\b(SELECT|INSERT INTO|UPDATE)\s+[a-z_]+\s+(FROM|SET|WHERE|VALUES)/i);
});

test('layout usa CSS dedicado, navegação responsiva e ícones vetoriais', () => {
  assert.match(view, /equipamentos-show\.css/);
  assert.doesNotMatch(view, /<style>/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /overflow-x:auto/);
  assert.match(view, /<svg/);
  assert.doesNotMatch(view, /✏️|🗑️/);
});
