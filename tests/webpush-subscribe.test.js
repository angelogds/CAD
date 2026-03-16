const test = require('node:test');
const assert = require('node:assert/strict');

const webPushService = require('../modules/notifications/webpush.service');

test('saveSubscription validates payload', () => {
  assert.throws(() => webPushService.saveSubscription({ userId: 1, subscription: {} }));
});
