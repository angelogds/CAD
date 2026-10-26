const test = require('node:test');
const assert = require('node:assert');
const { requireLogin, requireRole, requireAdmin, wantsJson } = require('../modules/auth/auth.middleware');

function mk(url, accept, user, xhr) {
  const req = { originalUrl: url, session: user ? { user } : {}, xhr: !!xhr, flash() {},
    get: (h) => (h.toLowerCase() === 'accept' ? accept : undefined),
    accepts(types) { const a = accept || '*/*'; for (const t of a.split(',').map(x => x.trim().split(';')[0])) { for (const c of types) { if (t === '*/*' || t.includes(c)) return c; } } return false; } };
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }, redirect(u) { this.code = 302; this.location = u; return this; },
    render() { this.code = this.code; return this; } };
  return { req, res };
}
const run = (mw, req, res) => { let nexted = false; mw(req, res, () => { nexted = true; }); return nexted; };

test('API sem sessão: 401 JSON, sem redirect', () => {
  for (const mw of [requireLogin, requireRole(['COMPRAS']), requireAdmin]) {
    const { req, res } = mk('/api/os/1?x=1', '*/*');
    assert.equal(run(mw, req, res), false);
    assert.equal(res.code, 401);
    assert.equal(res.body.error, 'unauthenticated');
    assert.equal(res.location, undefined);
  }
});
test('Accept json e XHR fora de /api também recebem JSON', () => {
  let { req, res } = mk('/os', 'application/json'); run(requireLogin, req, res); assert.equal(res.code, 401);
  ({ req, res } = mk('/os', 'text/html', null, true)); run(requireLogin, req, res); assert.equal(res.code, 401);
});
test('Navegador sem sessão continua redirecionando ao login', () => {
  for (const url of ['/os', '/api/x']) {
    const { req, res } = mk(url, 'text/html,application/xhtml+xml,*/*;q=0.8');
    run(requireLogin, req, res);
    assert.equal(res.code, 302);
    assert.match(res.location, /^\/auth\/login\?next=/);
  }
});
test('Permissões preservadas: papel errado 403 JSON; ADMIN e papel permitido passam', () => {
  let { req, res } = mk('/api/compras', '*/*', { role: 'MECANICO' });
  assert.equal(run(requireRole(['COMPRAS']), req, res), false);
  assert.equal(res.code, 403);
  assert.equal(res.body.error, 'forbidden');
  ({ req, res } = mk('/api/compras', '*/*', { role: 'ADMIN' }));
  assert.equal(run(requireRole(['COMPRAS']), req, res), true);
  ({ req, res } = mk('/api/x', '*/*', { role: 'MECANICO' }));
  assert.equal(run(requireAdmin, req, res), false);
  assert.equal(res.code, 403);
  ({ req, res } = mk('/api/x', '*/*', { role: 'MECANICO' }));
  assert.equal(run(requireLogin, req, res), true);
});
