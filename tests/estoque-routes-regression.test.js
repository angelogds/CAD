const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function exportedHandlers(source) {
  const match = source.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
  assert.ok(match, 'controller deve declarar module.exports');
  return new Set(match[1].split(',').map((name) => name.trim()).filter(Boolean));
}

test('todas as rotas principais do estoque apontam para handlers exportados', () => {
  const routes = read('modules/estoque/estoque.routes.js');
  const controller = read('modules/estoque/estoque.controller.js');
  const exported = exportedHandlers(controller);
  const handlers = [...routes.matchAll(/\bctrl\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);

  assert.ok(handlers.includes('criarLocal'), 'a rota POST /locais deve continuar ligada a criarLocal');
  for (const handler of handlers) {
    assert.ok(exported.has(handler), `handler ${handler} usado nas rotas do estoque precisa ser exportado pelo controller`);
  }
});
