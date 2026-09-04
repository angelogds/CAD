const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('reset de setembro zera saldo sem apagar histórico', () => {
  const migration = read('database/migrations/191_escala_reset_banco_horas_setembro_2026.sql');

  assert.match(migration, /2026-09-01/);
  assert.match(migration, /RESET INICIAL SETEMBRO\/2026/);
  assert.match(migration, /CREDITO_HORA_EXTRA/);
  assert.match(migration, /AJUSTE_CREDITO/);
  assert.match(migration, /AJUSTE_DEBITO/);
  assert.match(migration, /ABS\(saldo_minutos\)/);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+escala_banco_horas_movimentos/i);
  assert.doesNotMatch(migration, /DROP\s+TABLE/i);
});

test('solicitação de folga não exige motivo do colaborador', () => {
  const view = read('views/escala/meu-painel.ejs');

  assert.match(view, /Data desejada/);
  assert.match(view, /origem do direito à folga vem automaticamente das horas extras/i);
  assert.doesNotMatch(view, /name="motivo"/);
  assert.match(view, /Saldo atual/);
  assert.match(view, /Saldo após aprovação/);
});
