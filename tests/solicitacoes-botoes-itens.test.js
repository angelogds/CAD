const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const view = fs.readFileSync('views/solicitacoes/show.ejs', 'utf8');

test('ações dos itens usam rótulos simples e padronizados', () => {
  assert.match(view, /<summary>Editar<\/summary>/);
  assert.match(view, /<summary>Excluir<\/summary>/);
  assert.doesNotMatch(view, /Editar \/ propor alteração/);
  assert.doesNotMatch(view, /Solicitar exclusão/);
});

test('padronização visual preserva o fluxo de consenso existente', () => {
  assert.match(view, /\/itens\/<%=item\.id%>\/alteracao/);
  assert.match(view, /\/itens\/<%=item\.id%>\/exclusao\/solicitar/);
  assert.match(view, /name="motivo"/);
  assert.match(view, /Confirmar solicitação de exclusão deste item\?/);
});

test('ações compactas seguem padrão visual da listagem', () => {
  assert.match(view, /sol-item-actions-compact/);
  assert.match(view, /sol-item-action is-edit/);
  assert.match(view, /sol-item-action is-delete/);
});
