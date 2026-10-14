const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const service = require('../modules/automacao/automacao.service');
test('prensas v1 lista três prensas sem telemetria nem comandos', () => {
  const items = service.getPrensasOverview();
  assert.equal(items.length, 3);
  assert.equal(new Set(items.map(e => e.key)).size, 3);
  assert.ok(items.every(e => e.estado === 'SEM_SINAL' && e.integrado === false && e.comando_habilitado === false));
});
test('rota prensas é incluída nos setores da automação', () => {
  assert.equal(service.listSetores().find(e => e.key === 'prensas').href, '/automacao/prensas');
  const routes = fs.readFileSync(path.join(__dirname, '../modules/automacao/automacao.routes.js'),'utf8');
  assert.match(routes, /router\.get\('\/prensas'/);
});
test('tela das prensas usa desenho SVG e não comanda o CLP', () => {
  const page = fs.readFileSync(path.join(__dirname,'../views/automacao/prensas.ejs'),'utf8');
  assert.match(page, /<svg/);
  assert.match(page, /Não há conexão com CLP/);
  assert.match(page, /nenhuma escrita ou comando remoto é permitido/);
});
