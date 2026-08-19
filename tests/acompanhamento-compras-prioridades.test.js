const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'modules/compras/acompanhamento.service.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views/solicitacoes/acompanhamento-compras.ejs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/acompanhamento-compras.css'), 'utf8');

test('acompanhamento usa todos os períodos por padrão e não limita por disponivel_compras', () => {
  assert.match(service, /query\.periodo\) \? query\.periodo : 'todos'/);
  assert.doesNotMatch(service, /COALESCE\(s\.disponivel_compras,0\)=1/);
  assert.match(view, /\['todos','Todos os períodos'\]/);
});

test('painel separa prioridades na ordem crítica, alta, média, baixa e indefinida', () => {
  const critical = service.indexOf("key: 'critical'");
  const high = service.indexOf("key: 'high'");
  const medium = service.indexOf("key: 'medium'");
  const low = service.indexOf("key: 'low'");
  const undefinedPriority = service.indexOf("key: 'undefined'");
  assert.ok(critical >= 0 && critical < high && high < medium && medium < low && low < undefinedPriority);
  assert.match(view, /p\.priorityGroups\.forEach/);
  assert.match(view, /DISTRIBUIÇÃO POR PRIORIDADE/);
});

test('cada solicitação exibe percentuais de cotação, compra e recebimento sem ação operacional', () => {
  assert.match(service, /percentualCotado/);
  assert.match(service, /percentualComprado/);
  assert.match(service, /percentualRecebido/);
  assert.match(view, /\['Cotação',s\.percentualCotado\]/);
  assert.match(view, /\['Compra',s\.percentualComprado\]/);
  assert.match(view, /\['Recebimento',s\.percentualRecebido\]/);
  assert.doesNotMatch(view, /href="\/solicitacoes\/<%= s\.id %>/);
});

test('css diferencia visualmente todos os grupos e mantém responsividade', () => {
  for (const token of ['priority-critical','priority-high','priority-medium','priority-low']) {
    assert.ok(css.includes(token), `classe ausente: ${token}`);
  }
  assert.match(css, /@media\(max-width:760px\)/);
});
