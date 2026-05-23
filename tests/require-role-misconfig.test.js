const test = require('node:test');
const assert = require('node:assert/strict');
const { requireRole } = require('../modules/auth/auth.middleware');

test('requireRole blocks misconfigured undefined access list', () => {
  const middleware = requireRole(undefined);
  let statusCode = 200;
  let payload;
  middleware(
    { session: { user: { role: 'COMPRAS' } }, accepts: () => false },
    { status(code) { statusCode = code; return this; }, json(obj) { payload = obj; return this; } },
    () => { throw new Error('next should not be called'); }
  );

  assert.equal(statusCode, 500);
  assert.match(payload.error, /RBAC misconfiguration/i);
});
