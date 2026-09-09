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

test('acompanhamento executivo fica restrito a ADMIN e DIRETORIA em todas as rotas', () => {
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

test('interface possui andamento, histórico, sinalizadores e próxima ação', () => {
  assert.match(view, /PAINEL EXECUTIVO · DIRETORIA \/ ADMIN/);
  assert.match(view, /EM ANDAMENTO/);
  assert.match(view, /HISTÓRICO/);
  assert.match(view, /executive-signals/);
  assert.match(view, /AGUARDANDO APROVAÇÃO/);
  assert.match(view, /LIBERADAS \/ A COMPRAR/);
  assert.match(view, /Próxima ação/);
  assert.match(view, /management-row-history/);
  assert.match(view, /Concluída \/ atualizada em/);
  assert.match(view, /Recebimento/);
  assert.match(view, /Recebido/);
});

test('aprovação progressiva por item da PR anterior permanece intacta', () => {
  assert.match(controller, /compras\.aprovacao-itens\.service/);
  assert.match(controller, /itemApprovalService\.getSummary/);
  assert.match(controller, /itemApprovalService\.approveQuotedItems/);
  assert.match(detail, /aprovar-itens-cotados/);
  assert.match(detail, /Aprovar itens cotados/);
  assert.doesNotMatch(detail, /diretor_user_id/);
});

test('novo css mantém painel executivo responsivo', () => {
  assert.match(css, /\.executive-view-tabs/);
  assert.match(css, /\.executive-signals/);
  assert.match(css, /\.next-action-chip/);
  assert.match(css, /@media\(max-width:760px\)/);
});
