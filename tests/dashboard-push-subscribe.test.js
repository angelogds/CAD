const test = require('node:test');
const assert = require('node:assert/strict');

const webPushService = require('../modules/notifications/webpush.service');
const controller = require('../modules/dashboard/dashboard.controller');

test('dashboard subscribePush returns json success', () => {
  const old = webPushService.saveSubscription;
  webPushService.saveSubscription = () => ({ ok: true });

  const req = {
    body: { subscription: { endpoint: 'x', keys: { p256dh: 'a', auth: 'b' } } },
    session: { user: { id: 1 } },
    headers: { 'user-agent': 'node-test' },
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };

  controller.subscribePush(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  webPushService.saveSubscription = old;
});
