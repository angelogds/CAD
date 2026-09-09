const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const routes = read('modules/solicitacoes/solicitacoes.routes.js');
const service = read('modules/compras/acompanhamento.service.js');
const controller = read('modules/solicitacoes/solicitacoes.acompanhamento.controller.js');
const view = read('views/solicitacoes/acompanhamento-compras.ejs');
const detail = read('views/solicitacoes/acompanhamento-detalhe.ejs');
const minhas = read('views/solicitacoes/minhas.ejs');
const css = read('public/css/acompanhamento-compras-diretoria.css');

test('acompanhamento executivo mantém acesso técnico restrito a ADMIN e DIRETORIA em todas as rotas', () => {
  assert.match(routes, /ACOMPANHAMENTO_COMPRAS_EXECUTIVO\s*=\s*\[ROLE\.ADMIN, ROLE\.DIRETORIA\]/);
  assert.match(routes, /router\.get\("\/acompanhamento-compras", requireLogin, requireRole\(ACOMPANHAMENTO_COMPRAS_EXECUTIVO\)/);
  assert.match(routes, /router\.get\("\/acompanhamento-compras\/:id", requireLogin, requireRole\(ACOMPANHAMENTO_COMPRAS_EXECUTIVO\)/);
  assert.match(routes, /router\.post\("\/acompanhamento-compras\/:id\/aprovar-itens-cotados", requireLogin, requireRole\(ACOMPANHAMENTO_COMPRAS_EXECUTIVO\)/);
  assert.doesNotMatch(routes, /\/acompanhamento-compras"[^\n]+ACCESS\.compras_read/);
});

test('atalho de Acompanhar compras não é exibido para perfis operacionais', () => {
  assert.match(minhas, /canWatchExecutivePurchases/);
  assert.match(minhas, /\['ADMIN','ADMINISTRADOR','DIRETORIA','DIRECAO'\]/);
  assert.doesNotMatch(minhas, /canAccessModule\(user\?\.role,'compras_read'\).*Acompanhar compras/);
});

test('visão padrão é andamento e registros concluídos são separados sem criar arquivo paralelo', () => {
  assert.match(service, /const visao = \['andamento', 'historico', 'todos'\]/);
  assert.match(service, /: 'andamento';/);
  assert.match(service, /const andamento = base\.filter\(\(s\) => !s\.concluidaFluxo/);
  assert.match(service, /const historico = base\.filter\(\(s\) => s\.concluidaFluxo/);
  assert.match(service, /TERMINAIS\.has\(status\)/);
  assert.match(service, /Number\(solicitacao\?\.cotados \|\| 0\) >= total/);
  assert.match(service, /Number\(solicitacao\?\.comprados \|\| 0\) >= total/);
  assert.match(service, /Number\(solicitacao\?\.recebidos \|\| 0\) >= total/);
  assert.doesNotMatch(service, /INSERT\s+INTO\s+.*historico_compras/i);
});

test('histórico usa data de conclusão disponível e fallback não destrutivo', () => {
  assert.match(service, /function completionDateExpression/);
  assert.match(service, /'fechada_em'/);
  assert.match(service, /'recebida_total_em'/);
  assert.match(service, /'entregue_em'/);
  assert.match(service, /'updated_at'/);
  assert.match(service, /data_conclusao_referencia/);
  assert.match(service, /matchesPeriod\(s\.dataReferencia, filters, hoje\)/);
});

test('fila executiva calcula próxima ação e prioriza decisões', () => {
  for (const token of ['AGUARDANDO_APROVACAO','COTACAO_NECESSARIA','EFETIVAR_COMPRA','AGUARDANDO_RECEBIMENTO','RECEBIMENTO_PARCIAL','CONCLUIDA']) {
    assert.ok(controller.includes(token), `ação ausente: ${token}`);
  }
  assert.match(controller, /function executiveRank/);
  assert.match(controller, /row\.priorityGroup === 'critical'/);
  assert.match(controller, /row\.atrasada/);
  assert.match(controller, /painel\.executivo/);
  assert.match(controller, /semCotacaoItens/);
  assert.match(controller, /valorAguardandoAprovacao/);
  assert.match(controller, /saldoReceber/);
});

test('interface mantém visão executiva da Diretoria e remove andamento percentual redundante da tabela', () => {
  assert.match(view, /PAINEL EXECUTIVO · DIRETORIA/);
  assert.doesNotMatch(view, /PAINEL EXECUTIVO · DIRETORIA \/ ADMIN/);
  assert.match(view, /EM ANDAMENTO/);
  assert.match(view, /HISTÓRICO/);
  assert.match(view, /executive-signals/);
  assert.match(view, /AGUARDANDO APROVAÇÃO/);
  assert.match(view, /LIBERADAS \/ A COMPRAR/);
  assert.match(view, /Próxima ação/);
  assert.match(view, /management-row-history/);
  assert.match(view, /Concluída \/ atualizada em/);
  assert.doesNotMatch(view, /<th>Andamento<\/th>/);
  assert.doesNotMatch(view, /data-label="Andamento"/);
  assert.match(view, /system-compact-btn/);
});

test('aprovação ocorre somente sobre itens explicitamente selecionados', () => {
  assert.match(controller, /Selecione ao menos um item cotado para aprovação/);
  assert.match(controller, /itemApprovalService\.approveQuotedItems\(id, ids/);
  assert.match(detail, /type="checkbox" name="item_id"/);
  assert.match(detail, /form="approval-selection-form"/);
  assert.match(detail, /Aprovar selecionados/);
  assert.match(detail, /approval-selected-count/);
  assert.doesNotMatch(detail, /type="hidden" name="item_id"/);
  assert.doesNotMatch(detail, /Aprovar itens cotados/);
});

test('interface pública apresenta apenas Diretoria sem expor ADMIN como aprovador', () => {
  assert.match(detail, /ANÁLISE GERENCIAL · DIRETORIA/);
  assert.doesNotMatch(detail, /DIRETORIA \/ ADMIN/);
  assert.doesNotMatch(detail, /ADMIN\/DIRETORIA/);
  assert.doesNotMatch(detail, /Aguardando ADMIN/);
  assert.match(view, /<small>DIRETORIA<\/small>/);
  assert.doesNotMatch(view, /<small>ADMIN\/DIRETORIA<\/small>/);
});

test('novo css mantém painel executivo responsivo e botões compactos', () => {
  assert.match(css, /\.executive-view-tabs/);
  assert.match(css, /\.executive-signals/);
  assert.match(css, /\.next-action-chip/);
  assert.match(css, /\.system-compact-btn/);
  assert.match(css, /\.approval-select-input/);
  assert.match(css, /@media\(max-width:760px\)/);
});
