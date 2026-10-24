const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let db;
try { db = new (require('better-sqlite3'))(':memory:'); }
catch { db = new (require('node:sqlite').DatabaseSync)(':memory:'); }
require.cache[require.resolve('../database/db')] = { exports: db };
require('../database/migrations/229_automacao_dispositivos.js')();
require('../database/migrations/230_automacao_dispositivo_estados.js')();
require('../database/migrations/231_automacao_sinaleiros_bancada.js')();
require('../database/migrations/232_automacao_bancada_telemetria.js')();
require('../database/migrations/233_automacao_bancada_correlacao.js')();
const svc = require('../modules/automacao/dispositivos.service');
after(() => db.close());

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/d', require('../modules/automacao/dispositivos.routes'));
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port + '/d';
  try { await fn(base); } finally { srv.close(); }
}
const post = (u, token, body) => fetch(u, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body || {}),
});

test('token por dispositivo: hash, ping, fases, troca de escopo e revogação', async () => {
  const { token } = svc.issueToken('esp32-digestor-01', 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM automacao_dispositivos WHERE token_hash=?').get(token).n, 0);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM automacao_dispositivos').all()).includes(token));
  await withServer(async (b) => {
    assert.equal((await post(b + '/ping')).status, 401);
    assert.equal((await post(b + '/ping', 'cgd_errado_errado_errado_errado')).status, 401);
    const ping = await (await post(b + '/ping', token)).json();
    assert.equal(ping.comando_habilitado, false);
    assert.deepEqual(ping.comandos, []);
    const resp = await post(b + '/estado', token, { fase: 'FINAL' });
    assert.equal(resp.status, 200);
    const f = await resp.json();
    assert.deepEqual(f.sinaleiro, { sinaleiro: 'VERDE', piscando: true });
    assert.equal(f.digestor_id, 1);
    assert.equal((await post(b + '/estado', token, { fase: 'ABRIR_VALVULA' })).status, 400);
    assert.equal((await post(b + '/estado', token, { fase: 'INICIO', digestor_id: 2 })).status, 403);
    const l = svc.listDevices().find(d => d.device_id === 'ESP32-DIGESTOR-01');
    assert.equal(l.online, true);
    assert.equal(l.digestor_id, 1);
    assert.equal(l.fase, 'FINAL');
    assert.equal(l.estados[0].digestor_id, 1);
    const novo = svc.issueToken('ESP32-DIGESTOR-01', 1, 2).token;
    assert.equal((await post(b + '/ping', token)).status, 401);
    assert.equal((await post(b + '/estado', novo, { fase: 'MEIO', digestor_id: 1 })).status, 403);
    assert.equal((await post(b + '/estado', novo, { fase: 'MEIO', digestor_id: 2 })).status, 200);
    assert.equal(svc.listDevices().find(d => d.device_id === 'ESP32-DIGESTOR-01').escopo, '2');
    svc.revoke('ESP32-DIGESTOR-01');
    assert.equal((await post(b + '/ping', novo)).status, 401);
  });
});
test('token geral exige digestor_id e mantém os quatro estados independentes', async () => {
  assert.throws(() => svc.issueToken('ESP32-GERAL-01', 1), /Escolha/);
  assert.throws(() => svc.issueToken('ESP32-GERAL-01', 1, 'QUALQUER'), /inválido/);
  const d = svc.issueToken('ESP32-GERAL-01', 1, 'TODOS');
  assert.equal(d.escopo, 'TODOS');
  await withServer(async (b) => {
    assert.equal((await post(b + '/estado', d.token, { fase: 'INICIO' })).status, 400);
    assert.equal((await post(b + '/estado', d.token, { fase: 'INICIO', digestor_id: 5 })).status, 400);
    for (const [id, fase] of [[1, 'INICIO'], [2, 'MEIO'], [3, 'FINAL'], [4, 'INICIO']]) {
      const r = await post(b + '/estado', d.token, { fase, digestor_id: id });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).digestor_id, id);
    }
    const row = svc.listDevices().find(x => x.device_id === 'ESP32-GERAL-01');
    assert.equal(row.estados.length, 4);
    assert.deepEqual(row.estados.map(x => x.digestor_id), [1, 2, 3, 4]);
  });
});
test('somente ADMIN configura e rotas de escrita exigem CSRF', async () => {
  const routes = require('../modules/automacao/automacao.routes');
  const app = express(); app.use(express.json());
  let role = 'MANUTENCAO_SUPERVISOR';
  app.use((req, _res, next) => {
    req.session = { user: { id: 1, role }, automacaoConfigCsrf: 'csrf_test' };
    req.flash = () => {};
    next();
  });
  app.use('/automacao', routes);
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const opts = { headers: { Accept: 'application/json' } };
    assert.equal((await fetch(base + '/automacao/api/dispositivos', opts)).status, 403);
    assert.equal((await fetch(base + '/automacao/configuracao', opts)).status, 403);
    role = 'ADMIN';
    assert.equal((await fetch(base + '/automacao/api/dispositivos', opts)).status, 200);
    const u = base + '/automacao/api/dispositivos/ESP32-DIGESTOR-03/token';
    assert.equal((await fetch(u, { method: 'POST', headers: { Accept: 'application/json' } })).status, 403);
    const issued = await fetch(u, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CGD-CSRF': 'csrf_test' },
      body: JSON.stringify({ escopo: '3' }),
    });
    assert.equal(issued.status, 200);
    const data = await issued.json();
    assert.equal(data.escopo, '3');
    assert.match(data.token, /^cgd_/);
  } finally { server.close(); }
});
