const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../modules/escala/escala.pdf.js'), 'utf8');

test('PDFs da Escala priorizam o mesmo símbolo e paleta do PDF de Solicitações', () => {
  assert.match(source, /public\/IMG\/logopdf_campo_do_gado\.png\.png/);
  assert.match(source, /green:\s*"#16A34A"/);
  assert.match(source, /greenDark:\s*"#166534"/);
  assert.match(source, /ESCALA SEMANAL – MANUTENÇÃO INDUSTRIAL/);
  assert.match(source, /Banco de Horas da Manutenção/);
});
