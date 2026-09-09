const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'modules/compras/acompanhamento.service.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views/solicitacoes/acompanhamento-compras.ejs'), 'utf8');
const detailView = fs.readFileSync(path.join(root, 'views/solicitacoes/acompanhamento-detalhe.ejs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/acompanhamento-compras.css'), 'utf8');
const gerencialCss = fs.readFileSync(path.join(root, 'public/css/acompanhamento-compras-gerencial.css'), 'utf8');

test('acompanhamento usa todos os períodos por padrão e não limita por disponivel_compras', () => {
  assert.match(service, /query\.periodo\) \? query\.periodo : 'todos'/);
  assert.doesNotMatch(service, /COALESCE\(s\.disponivel_compras,0\)=1/);
  assert.match(view, /\['todos','Todos os períodos'\]/);
});

test('service mantém prioridades e dados gerenciais por solicitação', () => {
  const critical = service.indexOf("key: 'critical'");
  const high = service.indexOf("key: 'high'");
  const medium = service.indexOf("key: 'medium'");
  const low = service.indexOf("key: 'low'");
  const undefinedPriority = service.indexOf("key: 'undefined'");
  assert.ok(critical >= 0 && critical < high && high < medium && medium < low && low < undefinedPriority);
  assert.match(service, /percentualCotado/);
  assert.match(service, /percentualComprado/);
  assert.match(service, /percentualRecebido/);
  assert.match(service, /aprovacao_compra_status/);
  assert.match(service, /diretor_aprovador_nome/);
});

test('acompanhamento principal usa tabela larga em vez de cards por solicitação', () => {
  assert.match(view, /<table class="management-table">/);
  assert.match(view, /SOLICITAÇÕES E ANDAMENTO/);
  assert.match(view, /OS \/ Equipamento/);
  assert.match(view, /Compra \/ Recebimento/);
  assert.match(view, /Aprovação/);
  assert.match(view, /href="\/solicitacoes\/acompanhamento-compras\/<%=s\.id%>"/);
  assert.doesNotMatch(view, /class="request-watch priority-card-/);
});

test('tabela exibe cotado, sem cotação, comprado, recebido e valores reais', () => {
  assert.match(view, /s\.cotados/);
  assert.match(view, /s\.semCotacao/);
  assert.match(view, /s\.comprados/);
  assert.match(view, /s\.recebidos/);
  assert.match(view, /s\.cotadoCentavos/);
  assert.match(view, /s\.comprometidoCentavos/);
  assert.match(view, /s\.recebidoCentavos/);
});

test('detalhe gerencial é somente leitura para cotação e mostra itens completos', () => {
  assert.match(detailView, /CONSULTA GERENCIAL · SOMENTE LEITURA/);
  assert.match(detailView, /ITENS DA SOLICITAÇÃO/);
  assert.match(detailView, /Fornecedor/);
  assert.match(detailView, /Valor unitário/);
  assert.match(detailView, /A receber/);
  assert.doesNotMatch(detailView, /\/compras\/solicitacoes\/<%=d\.id%>\/painel-itens/);
  assert.doesNotMatch(detailView, /name="valor_unitario"/);
});

test('detalhe permite apenas a decisão do diretor designado quando controller autoriza', () => {
  assert.match(detailView, /if\(canDirectorApprove\)/);
  assert.match(detailView, /\/solicitacoes\/acompanhamento-compras\/<%=d\.id%>\/aprovar/);
  assert.match(detailView, /\/solicitacoes\/acompanhamento-compras\/<%=d\.id%>\/reprovar/);
});

test('custo mensal por equipamento usa a coleção realmente entregue pelo service', () => {
  assert.match(service, /custosMensaisEquipamentos:\s*getMonthlyEquipmentCosts\(\)/);
  assert.match(view, /Array\.isArray\(p\.custosMensaisEquipamentos\)/);
  assert.match(view, /x\.equipamento_nome/);
  assert.match(view, /x\.compradoCentavos/);
  assert.doesNotMatch(view, /p\.equipamentos\.map/);
});

test('css mantém responsividade e tabela vira cartões de linha apenas no mobile', () => {
  for (const token of ['priority-critical','priority-high','priority-medium','priority-low']) {
    assert.ok(css.includes(token), `classe ausente: ${token}`);
  }
  assert.match(gerencialCss, /\.management-table/);
  assert.match(gerencialCss, /@media\(max-width:760px\)/);
  assert.match(gerencialCss, /\.management-table thead\{display:none\}/);
});
