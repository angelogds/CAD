const test = require('node:test');
const assert = require('node:assert/strict');

test('os controller loads and exports required handlers', () => {
  const controller = require('../modules/os/os.controller');
  assert.equal(typeof controller.osIndex, 'function');
  assert.equal(typeof controller.osNewForm, 'function');
  assert.equal(typeof controller.osCreate, 'function');
  assert.equal(typeof controller.osShow, 'function');
  assert.equal(typeof controller.osUpdateStatus, 'function');
});
