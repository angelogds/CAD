const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('sidebar has tracagem menu item', () => {
  const file = path.join(__dirname, '..', 'views', 'partials', 'sidebar.ejs');
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /navItem\('\/tracagem',\s*'Traçagem'/);
  assert.match(html, /Traçagem/);
});
