const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const db = new (require('better-sqlite3'))(':memory:');
require.cache[require.resolve('../database/db')] = { exports: db };
for (const migration of [
  '229_automacao_dispositivos', '230_automacao_dispositivo_estados',
  '231_automacao_sinaleiros_bancada', '232_automacao_bancada_telemetria',
  '233_automacao_bancada_correlacao', '234_automacao_esp32_local_url',
  '235_automacao_temperatura_real', '236_automacao_sensor_simulado',
]) require('../database/migrations/' + migration)();
const { normalizeRole, canAccessModule } = require('../config/rbac');
const app = express();
app.engine('ejs', require('ejs-mate'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
let role = 'ADMIN';
app.use((req, res, next) => {
  req.session = { user: role ? { id: 1, name: 'Operador de teste', role } : null };
  req.flash = () => [];
  Object.assign(res.locals, {
    user: req.session.user, isAdmin: role === 'ADMIN', normalizeRole, canAccessModule,
    VAPID_PUBLIC_KEY: '', operationalCounters: {}, flash: {},
    lubrificacaoAlertasCount: 0, osChatNotificacoes: [],
  });
  next();
});
app.use('/automacao', require('../modules/automacao/automacao.routes'));
let server;
async function request(route) {
  if (!server) await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  return fetch('http://127.0.0.1:' + server.address().port + route, { redirect: 'manual' });
}
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});

test('telas 2A e simulador renderizam pelo router e layout reais, com uma assinatura da empresa', async () => {
  role = 'ADMIN';
  for (const route of ['', '/digestores', '/digestores/simulador', '/decanters', '/decanters/simulador', '/prensas', '/configuracao']) {
    const response = await request('/automacao' + route);
    const html = await response.text();
    assert.equal(response.status, 200, route + ': ' + html.slice(0, 160));
    assert.match(html, /<title>2A Automação Industrial/);
    assert.equal((html.match(/Ângelo Gomes da Silva — Fundador/g) || []).length, 1, route);
    assert.doesNotMatch(html, /Pauler B|Paulo B|Rogério Gomes/);
    assert.match(html, /auto-page[^\"]*auto-2a/);
    assert.match(html, /data-nav-label="2A Automação Industrial"/);
  }
});

test('nova apresentação preserva leitura autorizada e configuração exclusiva do ADMIN', async () => {
  role = 'DIRETORIA';
  const home = await request('/automacao');
  const html = await home.text();
  assert.equal(home.status, 200);
  assert.doesNotMatch(html, /href="\/automacao\/configuracao"/);
  assert.equal((await request('/automacao/decanters')).status, 200);
  assert.equal((await request('/automacao/decanters/simulador')).status, 403);
  const readOnly = await (await request('/automacao/decanters')).text();
  assert.doesNotMatch(readOnly, /id="dec-sim-panel"|id="dec-demo-start"|href="\/automacao\/decanters\/simulador"/);
  assert.equal((await request('/automacao/configuracao')).status, 403);
  role = 'PRODUCAO';
  assert.equal((await request('/automacao/decanters')).status, 403);
  role = null;
  const loggedOut = await request('/automacao/decanters');
  assert.equal(loggedOut.status, 302);
  assert.match(loggedOut.headers.get('location'), /login/);
});

test('simulador das decanters é exclusivo de ADMIN, encarregado e supervisor de manutenção', async () => {
  for (const allowed of ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO']) {
    role = allowed;
    const response = await request('/automacao/decanters/simulador');
    assert.equal(response.status, 200, allowed);
    assert.match(await response.text(), /data-dec-simulation-allowed="true"/);
  }
  role = 'ENCARREGADO_MANUTENCAO';
  const home = await (await request('/automacao')).text();
  assert.match(home, /href="\/automacao\/decanters"/);
  assert.doesNotMatch(home, /href="\/automacao\/digestores"|href="\/automacao\/prensas"|href="\/automacao\/configuracao"/);
  assert.equal((await request('/automacao/digestores')).status, 403);
  assert.equal((await request('/automacao/prensas')).status, 403);
  for (const denied of ['DIRETORIA', 'PRODUCAO', 'ENCARREGADO_PRODUCAO', 'MECANICO', 'RH']) {
    role = denied;
    assert.equal((await request('/automacao/decanters/simulador')).status, 403, denied);
  }
});
