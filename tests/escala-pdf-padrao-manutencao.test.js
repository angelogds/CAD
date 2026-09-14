const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../modules/escala/escala.pdf.js'), 'utf8');

test('PDFs da Escala priorizam logo oficial da manutenção e paleta padrão', () => {
  assert.match(source, /public\/IMG\/logo_menu\.png\.png/);
  assert.match(source, /green:\s*"#16A34A"/);
  assert.match(source, /greenDark:\s*"#166534"/);
  assert.match(source, /ESCALA SEMANAL – MANUTENÇÃO INDUSTRIAL/);
  assert.match(source, /Banco de Horas da Manutenção/);
});

test('PDF individual usa OS real da hora extra e consolidado detalha funcionário por OS', () => {
  assert.match(source, /os:h\.os_id \|\| '-'/);
  assert.match(source, /Detalhamento por funcionário \/ OS/);
  assert.match(source, /funcionario:h\.colaborador_nome/);
  assert.match(source, /local:h\.equipamento_nome \|\| h\.os_equipamento \|\| '-'/);
  assert.match(source, /servico:h\.descricao_servico \|\| h\.os_descricao \|\| '-'/);
});
