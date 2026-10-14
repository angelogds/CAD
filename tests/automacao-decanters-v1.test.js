const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const service = require('../modules/automacao/automacao.service');

test('área decanters lista sete equipamentos com identificadores únicos', () => {
  const equipamentos = service.getDecantersOverview();
  assert.equal(equipamentos.length, 7);
  assert.equal(new Set(equipamentos.map((e) => e.key)).size, 7);
  assert.equal(equipamentos.filter((e) => e.tipo === 'decanter').length, 2);
  assert.equal(equipamentos.filter((e) => e.tipo === 'bomba').length, 3);
  assert.equal(equipamentos.filter((e) => e.tipo === 'tanque').length, 1);
  assert.equal(equipamentos.filter((e) => e.tipo === 'rosca').length, 1);
  assert.ok(equipamentos.every((e) => e.estado === 'SEM_SINAL' && !e.integrado && !e.comando_habilitado && e.telemetria === null));
});
test('setor decanters usa rota própria dentro da automação', () => {
  const setor = service.listSetores().find((e) => e.key === 'decanters');
  assert.equal(setor.href, '/automacao/decanters');
  const routes = fs.readFileSync(path.join(__dirname, '../modules/automacao/automacao.routes.js'), 'utf8');
  assert.match(routes, /router\.get\('\/decanters'/);
});
test('tela decanters inclui símbolos SVG e interface sem acionamento', () => {
  const html = fs.readFileSync(path.join(__dirname, '../views/automacao/decanters.ejs'), 'utf8');
  for (const name of ['dec-decanter', 'dec-bomba', 'dec-tanque', 'dec-rosca']) assert.ok(html.includes(name));
  assert.match(html, /Sem hardware conectado/);
  assert.match(html, /Comandos: indisponíveis/);
});
