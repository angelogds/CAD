const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'modules/compras/acompanhamento.service.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'modules/solicitacoes/solicitacoes.acompanhamento.controller.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views/solicitacoes/acompanhamento-compras.ejs'), 'utf8');
const detailView = fs.readFileSync(path.join(root, 'views/solicitacoes/acompanhamento-detalhe.ejs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/acompanhamento-compras.css'), 'utf8');
const gerencialCss = fs.readFileSync(path.join(root, 'public/css/acompanhamento-compras-gerencial.css'), 'utf8');
const approvalCss = fs.readFileSync(path.join(root, 'public/css/aprovacao-itens-progressiva.css'), 'utf8');

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
});

test('acompanhamento principal usa tabela larga sem coluna percentual redundante', () => {
  assert.match(view, /management-table executive-management-table/);
  assert.match(view, /FILA DE ACOMPANHAMENTO/);
  assert.match(view, /OS \/ Equipamento/);
  assert.match(view, /AGUARDANDO APROVAÇÃO/);
  assert.match(view, /PARA APROVAR/);
  assert.match(view, /system-compact-btn/);
  assert.doesNotMatch(view, /Abrir e aprovar/);
  assert.doesNotMatch(view, /<th>Andamento<\/th>/);
  assert.doesNotMatch(view, /data-label="Andamento"/);
  assert.match(view, /management-row-needs-approval/);
  assert.match(view, /href="\/solicitacoes\/acompanhamento-compras\/<%=s\.id%>"/);
  assert.doesNotMatch(view, /class="request-watch priority-card-/);
});

test('controller enriquece cada solicitação com aprovação progressiva por item', () => {
  assert.match(controller, /itemApprovalService\.getSummary\(row\.id\)/);
  assert.match(controller, /itensPendentes/);
  assert.match(controller, /valorPendente/);
  assert.match(controller, /solicitacoesPendentes/);
});

test('detalhe gerencial mostra dados essenciais e seleção por item', () => {
  assert.match(detailView, /ANÁLISE GERENCIAL · DIRETORIA/);
  assert.doesNotMatch(detailView, /DIRETORIA \/ ADMIN/);
  assert.match(detailView, /ITENS PARA ACOMPANHAMENTO E APROVAÇÃO/);
  assert.match(detailView, /<th>Selecionar<\/th>/);
  assert.match(detailView, /<th>Material<\/th>/);
  assert.match(detailView, /<th>Qtd\.<\/th>/);
  assert.match(detailView, /<th>Situação<\/th>/);
  assert.match(detailView, /<th>Fornecedor<\/th>/);
  assert.match(detailView, /<th>Valor cotado<\/th>/);
  assert.match(detailView, /<th>Aprovação<\/th>/);
  assert.doesNotMatch(detailView, /<th>Valor unitário<\/th>/);
  assert.doesNotMatch(detailView, /<th>Recebimento<\/th>/);
  assert.doesNotMatch(detailView, /<th>A receber<\/th>/);
  assert.doesNotMatch(detailView, /<th>Valor comprado<\/th>/);
  assert.doesNotMatch(detailView, /name="valor_unitario"/);
});

test('Diretoria aprova apenas itens selecionados com proteção contra envio vazio', () => {
  assert.match(detailView, /if\(canApproveItems\)/);
  assert.match(detailView, /aprovar-itens-cotados/);
  assert.match(detailView, /type="checkbox" name="item_id"/);
  assert.match(detailView, /Aprovar selecionados/);
  assert.match(detailView, /approval-main-button/);
  assert.match(controller, /Selecione ao menos um item cotado para aprovação/);
  assert.doesNotMatch(detailView, /Reprovar \/ devolver/);
  assert.doesNotMatch(detailView, /diretor responsável/);
  assert.doesNotMatch(detailView, /ADMIN\/DIRETORIA/);
});

test('quantidade comprada legada usa solicitado como fallback na visão gerencial', () => {
  assert.match(controller, /purchased && Number\(item\.qtdComprada \|\| 0\) <= 0/);
  assert.match(controller, /item\.qtdComprada = Number\(item\.qtdSolicitada \|\| 0\)/);
});

test('custo mensal por equipamento usa a coleção realmente entregue pelo service', () => {
  assert.match(service, /custosMensaisEquipamentos:\s*getMonthlyEquipmentCosts\(\)/);
  assert.match(view, /Array\.isArray\(p\.custosMensaisEquipamentos\)/);
  assert.match(view, /x\.equipamento_nome/);
  assert.match(view, /x\.compradoCentavos/);
  assert.doesNotMatch(view, /p\.equipamentos\.map/);
});

test('css mantém responsividade e destaque de aprovação', () => {
  for (const token of ['priority-critical','priority-high','priority-medium','priority-low']) {
    assert.ok(css.includes(token), `classe ausente: ${token}`);
  }
  assert.match(gerencialCss, /\.management-table/);
  assert.match(gerencialCss, /@media\(max-width:760px\)/);
  assert.match(approvalCss, /management-row-needs-approval/);
  assert.match(approvalCss, /approval-row-pending/);
  assert.match(approvalCss, /@media\(max-width:760px\)/);
});
