const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const legacyRoutes = read('modules/solicitacoes/solicitacoes.routes.js');
const directorRoutes = read('modules/diretoria/diretoria.routes.js');
const service = read('modules/compras/acompanhamento.service.js');
const controller = read('modules/solicitacoes/solicitacoes.acompanhamento.controller.js');
const view = read('views/solicitacoes/acompanhamento-compras.ejs');
const detail = read('views/solicitacoes/acompanhamento-detalhe.ejs');
const css = read('public/css/acompanhamento-compras-diretoria.css');

test('acompanhamento executivo fica no Painel da Diretoria e URLs antigas redirecionam', () => {
  assert.match(directorRoutes, /DIRETORIA_COMPRAS/);
  assert.match(directorRoutes, /router\.get\('\/compras', requireLogin, requireRole\(DIRETORIA_COMPRAS\)/);
  assert.match(directorRoutes, /router\.get\('\/compras\/:id', requireLogin, requireRole\(DIRETORIA_COMPRAS\)/);
  assert.match(directorRoutes, /router\.post\('\/compras\/:id\/aprovar-itens-cotados', requireLogin, requireRole\(DIRETORIA_COMPRAS\)/);
  assert.match(legacyRoutes, /DIRETORIA_COMPRAS_PATH = "\/dashboard\/diretoria\/compras"/);
  assert.match(legacyRoutes, /router\.get\("\/acompanhamento-compras"/);
  assert.match(legacyRoutes, /redirectAcompanhamentoCompras/);
  assert.match(legacyRoutes, /redirectAprovacaoCompras/);
});

test('controller reutiliza serviços canônicos de compras sem duplicar SQL', () => {
  assert.match(controller, /require\('\.\.\/compras\/acompanhamento\.service'\)/);
  assert.match(controller, /require\('\.\.\/compras\/compras\.aprovacao-itens\.service'\)/);
  assert.match(controller, /acompanhamentoService\.getDashboard\(req\.query\)/);
  assert.match(controller, /itemApprovalService\.getSummary\(row\.id\)/);
  assert.match(controller, /itemApprovalService\.approveQuotedItems/);
  assert.match(controller, /acompanhamentoBasePath: context\.basePath/);
  assert.match(controller, /backHref: activeMenu === 'diretoria' \? '\/dashboard\/diretoria'/);
  assert.doesNotMatch(controller, /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
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

test('interface mantém visão executiva da Diretoria e navega pela base configurável', () => {
  assert.match(view, /PAINEL EXECUTIVO · DIRETORIA/);
  assert.match(view, /EM ANDAMENTO/);
  assert.match(view, /HISTÓRICO/);
  assert.match(view, /executive-signals/);
  assert.match(view, /AGUARDANDO APROVAÇÃO/);
  assert.match(view, /LIBERADAS \/ A COMPRAR/);
  assert.match(view, /Próxima ação/);
  assert.match(view, /management-row-history/);
  assert.match(view, /acompanhamentoPath/);
  assert.doesNotMatch(view, /<th>Andamento<\/th>/);
});

test('aprovação ocorre somente sobre itens explicitamente selecionados', () => {
  assert.match(controller, /Selecione ao menos um item cotado para aprovação/);
  assert.match(controller, /itemApprovalService\.approveQuotedItems\(id, ids/);
  assert.match(detail, /type="checkbox" name="item_id"/);
  assert.match(detail, /form="approval-selection-form"/);
  assert.match(detail, /Aprovar selecionados/);
  assert.match(detail, /approval-selected-count/);
  assert.match(detail, /acompanhamentoPath/);
  assert.doesNotMatch(detail, /type="hidden" name="item_id"/);
});

test('interface pública apresenta somente Diretoria como aprovadora', () => {
  assert.match(detail, /ANÁLISE GERENCIAL · DIRETORIA/);
  assert.doesNotMatch(detail, /DIRETORIA \/ ADMIN/);
  assert.doesNotMatch(detail, /ADMIN\/DIRETORIA/);
  assert.match(view, /<small>DIRETORIA<\/small>/);
});

test('acompanhamento preserva valores por etapa e custo mensal por equipamento', () => {
  assert.match(view, /VALORES POR ETAPA/);
  assert.match(view, /CUSTO COMPRADO NO MÊS POR EQUIPAMENTO/);
  assert.match(view, /p\.valores\?\.cotado/);
  assert.match(view, /p\.valores\?\.comprometido/);
  assert.match(view, /p\.valores\?\.recebido/);
  assert.match(view, /custosEquipamentos/);
});

test('css executivo permanece responsivo e com ações compactas', () => {
  assert.match(css, /\.executive-view-tabs/);
  assert.match(css, /\.executive-signals/);
  assert.match(css, /\.next-action-chip/);
  assert.match(css, /\.system-compact-btn/);
  assert.match(css, /\.approval-select-input/);
  assert.match(css, /@media\(max-width:760px\)/);
});
