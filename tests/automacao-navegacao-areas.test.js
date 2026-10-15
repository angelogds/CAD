const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const views = [
  ['index', '/automacao'],
  ['digestores', '/automacao/digestores'],
  ['decanters', '/automacao/decanters'],
  ['prensas', '/automacao/prensas'],
];
test('navegação da Automação IHM preserva links entre todas as áreas', () => {
  for (const [name, active] of views) {
    const html = fs.readFileSync(path.join(__dirname, '../views/automacao', name + '.ejs'), 'utf8');
    assert.match(html, /aria-label="Navegação das áreas de automação"/);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    for (const [, href] of views) assert.ok(html.includes('href="' + href + '"'), name + ' não aponta para ' + href);
    assert.ok(html.includes('href="' + active + '" aria-current="page"'));
  }
});
