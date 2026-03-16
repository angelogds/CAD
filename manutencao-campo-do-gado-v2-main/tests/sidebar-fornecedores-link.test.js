const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('sidebar has fornecedores menu item', () => {
  const file = path.join(__dirname, '..', 'views', 'partials', 'sidebar.ejs');
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /href="\/fornecedores"/);
  assert.match(html, /Fornecedores/);
});
