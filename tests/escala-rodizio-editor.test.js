const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('salvar rodízio aplica imediatamente e sobrescreve escala para refletir editor', () => {
  const controller = fs.readFileSync(path.join(__dirname, '..', 'modules', 'escala', 'escala.controller.js'), 'utf8');
  const match = controller.match(/exports\.salvarRodizio = \(req, res\) => \{[\s\S]*?^\};/m);
  assert.ok(match, 'handler salvarRodizio deve existir');
  const handler = match[0];
  assert.match(handler, /service\.salvarConfiguracaoRodizio/);
  assert.match(handler, /service\.aplicarRodizioNaEscala/);
  assert.match(handler, /sobrescrever:\s*'1'/);
  assert.match(handler, /reprocessarPreventivasComNovaEscala\(\)/);
  assert.match(handler, /res\.redirect\('\/escala\/completa'\)/);
});
