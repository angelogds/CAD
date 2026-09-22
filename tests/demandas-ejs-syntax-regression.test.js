const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const demandasViews = path.join(root, 'views', 'demandas');

test('todas as views EJS de Demandas compilam sem erro de sintaxe', () => {
  const files = fs.readdirSync(demandasViews)
    .filter((name) => name.endsWith('.ejs'))
    .sort();

  assert.ok(files.length >= 3, 'views de Demandas esperadas não foram encontradas');

  for (const file of files) {
    const fullPath = path.join(demandasViews, file);
    const source = fs.readFileSync(fullPath, 'utf8');
    assert.doesNotThrow(
      () => ejs.compile(source, { filename: fullPath }),
      `view ${file} deve compilar sem erro de sintaxe`
    );
  }
});

test('etapa OS/execução mantém operadores lógicos válidos no detalhe da Demanda', () => {
  const detail = fs.readFileSync(path.join(demandasViews, 'view.ejs'), 'utf8');
  assert.match(detail, /linkedOrders\.length \|\| demanda\.started_at \|\| isFinished \? 'done' : ''/);
  assert.doesNotMatch(detail, /demanda\.started_at\s+isFinished/);
});
