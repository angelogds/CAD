const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

for (const mod of ['../modules/os/os.routes', '../modules/dashboard/dashboard.routes']) {
  test(`${mod} does not use legacy const safe wrapper`, () => {
    const content = fs.readFileSync(require.resolve(mod), 'utf8');
    assert.equal(content.includes('const safe ='), false);
  });
}
