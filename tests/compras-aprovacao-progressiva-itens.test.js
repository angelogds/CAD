const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'database/migrations/193_compras_aprovacao_progressiva_por_item.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'modules/compras/compras.aprovacao-itens.service.js'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'modules/compras/compras.aprovacao.middleware.js'), 'utf8');
const solicitacoesRoutes = fs.readFileSync(path.join(root, 'modules/solicitacoes/solicitacoes.routes.js'), 'utf8');
const comprasRoutes = fs.readFileSync(path.join(root, 'modules/compras/compras.routes.js'), 'utf8');

test('migration de aprovação por item é aditiva e mantém histórico', () => {
  for (const column of [
    'aprovacao_item_status',
    'aprovacao_item_por_user_id',
    'aprovacao_item_em',
    'aprovacao_item_assinatura',
    'aprovacao_item_valor_centavos',
  ]) assert.match(migration, new RegExp(column));
  assert.match(migration, /compras_aprovacoes_itens_historico/);
  assert.doesNotMatch(migration, /\bDROP\b/i);
  assert.doesNotMatch(migration, /\bDELETE\b/i);
});

test('item cotado válido entra automaticamente como aguardando aprovação', () => {
  assert.match(service, /status_cotacao.*COTADO/s);
  assert.match(service, /Number\(item\.fornecedor_id \|\| 0\) > 0/);
  assert.match(service, /Number\(item\.valor_unitario_centavos \|\| 0\) > 0/);
  assert.match(service, /return ITEM_APPROVAL\.PENDING/);
  assert.doesNotMatch(service, /Finalize a cotação de todos os itens ativos/);
});

test('aprovação é individual, auditada e aceita ADMIN ou DIRETORIA', () => {
  assert.match(service, /role === ROLE\.ADMIN \|\| role === ROLE\.DIRETORIA/);
  assert.match(service, /approveQuotedItems/);
  assert.match(service, /aprovacao_item_por_user_id/);
  assert.match(service, /aprovacao_item_em=datetime\('now'\)/);
  assert.match(service, /compras_aprovacoes_itens_historico/);
  assert.match(solicitacoesRoutes, /requireRole\(\[ROLE\.ADMIN, ROLE\.DIRETORIA\]\)/);
});

test('mudança em quantidade fornecedor ou valor invalida somente a assinatura do item', () => {
  assert.match(service, /qtd_solicitada/);
  assert.match(service, /fornecedor_id/);
  assert.match(service, /valor_unitario_centavos/);
  assert.match(service, /aprovacao_item_assinatura/);
  assert.match(service, /approvalState === ITEM_APPROVAL\.PENDING/);
  assert.match(service, /COMPRA_DIVERGE_DA_APROVACAO_ITEM/);
  assert.match(middleware, /assertPurchasePayloadMatchesApprovedItems/);
});

test('Compras só compra os itens selecionados que estejam aprovados', () => {
  assert.match(comprasRoutes, /requireApprovedPurchaseIntent/);
  assert.match(middleware, /req\.body\?\.comprar/);
  assert.match(service, /assertItemsApprovedForPurchase/);
  assert.match(service, /ITENS_AGUARDANDO_APROVACAO/);
});

test('fluxo antigo de aprovação total/manual não é exposto nas rotas', () => {
  assert.doesNotMatch(comprasRoutes, /\/aprovacao\/enviar/);
  assert.doesNotMatch(comprasRoutes, /\/aprovacao\/manual/);
  assert.doesNotMatch(solicitacoesRoutes, /\/acompanhamento-compras\/:id\/reprovar/);
});
