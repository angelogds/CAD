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

test('editor de rodízio permite modo individual ou equipe dupla', () => {
  const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'escala', 'rodizio.ejs'), 'utf8');
  assert.match(view, /name="modoNoturno"/);
  assert.match(view, /Individual: 1 colaborador por semana/);
  assert.match(view, /Equipe dupla: 2 colaboradores por semana/);
  assert.match(view, /Plantonista Noite 2/);
});

test('serviço salva modo noturno duplo e valida duplicidade semanal', () => {
  const service = fs.readFileSync(path.join(__dirname, '..', 'modules', 'escala', 'escala.service.js'), 'utf8');
  assert.match(service, /modoNoturnoRodizio/);
  assert.match(service, /modo_noturno/);
  assert.match(service, /ordem_noturno/);
  assert.match(service, /Selecione dois colaboradores diferentes para o plantão noturno da Semana/);
  assert.match(service, /plantonistasNoturnos/);
});
