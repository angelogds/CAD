const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('build do MLightCAD não copia public recursivamente para dentro do próprio outDir', () => {
  const buildScript = read('scripts/build-mlightcad.mjs');
  assert.match(buildScript, /publicDir:\s*false/);
  assert.match(buildScript, /public\/vendor\/mlightcad|path\.join\(root, 'public\/vendor\/mlightcad'\)/);
});
