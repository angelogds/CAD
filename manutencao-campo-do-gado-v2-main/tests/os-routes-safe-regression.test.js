const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const content = fs.readFileSync(require.resolve('../modules/os/os.routes'), 'utf8');

test('os.routes does not reintroduce legacy safe declaration', () => {
  assert.equal(content.includes('const safe ='), false);
});
