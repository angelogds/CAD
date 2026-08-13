const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('painel destaca solicitações ativas por prioridade antes do andamento', () => {
  const view = fs.readFileSync('views/compras/solicitacoes/index.ejs', 'utf8');
  assert.ok(view.indexOf('SOLICITAÇÕES QUE EXIGEM ATENÇÃO') < view.indexOf('ANDAMENTO GERAL DAS COMPRAS'));
  assert.match(view, /closedStatuses = \['FECHADA','CANCELADA','RECEBIDA_TOTAL'\]/);
  assert.match(view, /CRÍTICAS E ALTA PRIORIDADE/);
  assert.match(view, /PRIORIDADE MÉDIA/);
  assert.match(view, /PRIORIDADE BAIXA/);
  assert.match(view, /Exibir 10/);
  assert.match(view, /Exibir 20/);
  assert.match(view, /Iniciar cotação/);
});
