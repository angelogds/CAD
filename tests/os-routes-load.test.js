const test = require('node:test');
const assert = require('node:assert/strict');

test('os routes module loads without duplicate safe declaration', () => {
  assert.doesNotThrow(() => {
    const router = require('../modules/os/os.routes');
    assert.ok(router);
  });
});
