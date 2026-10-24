const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let db;
try { db = new (require('better-sqlite3'))(':memory:'); } catch { db = new (require('node:sqlite').DatabaseSync)(':memory:'); }
require.cache[require.resolve('../database/db')] = { exports: db };
require('../database/migrations/229_automacao_dispositivos.js')();
const svc = require('../modules/automacao/dispositivos.service');
after(() => db.close());

async function withServer(fn) {
  const app = express(); app.use(express.json());
  app.use('/d', require('../modules/automacao/dispositivos.routes'));
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/d`;
  try { await fn(base); } finally { srv.close(); }
}
const post = (u, token, body) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) });

test('token: só o hash é gravado, ping e fases funcionam, rotação e revogação invalidam', async () => {
  const { token } = svc.issueToken('esp32-digestor-01', 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM automacao_dispositivos WHERE token_hash=?').get(token).n, 0);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM automacao_dispositivos').all()).includes(token));
  await withServer(async (b) => {
    assert.equal((await post(`${b}/ping`)).status, 401);
    assert.equal((await post(`${b}/ping`, 'cgd_errado_errado_errado_errado')).status, 401);
    const ping = await (await post(`${b}/ping`, token)).json();
    assert.equal(ping.comando_habilitado, false); assert.deepEqual(ping.comandos, []);
    const f = await (await post(`${b}/estado`, token, { fase: 'final' })).json();
    assert.deepEqual(f.sinaleiro, { sinaleiro: 'VERDE', piscando: true });
    assert.equal((await post(`${b}/estado`, token, { fase: 'ABRIR_VALVULA' })).status, 400);
    const l = svc.listDevices()[0];
    assert.equal(l.online, true); assert.equal(l.digestor_id, 1); assert.equal(l.fase, 'FINAL');
    const novo = svc.issueToken('ESP32-DIGESTOR-01').token;
    assert.equal((await post(`${b}/ping`, token)).status, 401);
    assert.equal((await post(`${b}/ping`, novo)).status, 200);
    svc.revoke('ESP32-DIGESTOR-01');
    assert.equal((await post(`${b}/ping`, novo)).status, 401);
  });
});
