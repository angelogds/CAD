const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'compras', 'solicitacoes', 'show.ejs'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'compras-painel.js'), 'utf8');

test('painel diferencia salvar rascunho de efetivar a compra', () => {
  assert.match(view, /name="acao" value="salvar"/);
  assert.match(view, /name="acao" value="comprar"/);
  assert.match(script, /event\.submitter/);
});

test('painel oferece seleção em lote acessível para itens cotados', () => {
  assert.match(view, /id="select-all-items"/);
  assert.match(view, /role="progressbar"/);
  assert.match(script, /syncSelectAll/);
});
