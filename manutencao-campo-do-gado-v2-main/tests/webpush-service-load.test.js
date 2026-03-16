const test = require('node:test');
const assert = require('node:assert/strict');

test('webpush service module loads without syntax/runtime errors', () => {
  assert.doesNotThrow(() => {
    const svc = require('../modules/notifications/webpush.service');
    assert.equal(typeof svc.saveSubscription, 'function');
  });
});
