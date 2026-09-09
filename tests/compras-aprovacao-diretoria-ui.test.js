const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const show = fs.readFileSync(path.join(root, 'views/compras/solicitacoes/show.ejs'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'modules/compras/compras.routes.js'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'modules/compras/compras.aprovacao.middleware.js'), 'utf8');
const itemService = fs.readFileSync(path.join(root, 'modules/compras/compras.aprovacao-itens.service.js'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/js/compras-painel.js'), 'utf8');
const approvalCss = fs.readFileSync(path.join(root, 'public/css/compras-aprovacao-diretoria.css'), 'utf8');

test('fluxo antigo de envio para diretor e aprovação manual deixa de ser operacional', () => {
  assert.doesNotMatch(routes, /\/aprovacao\/enviar/);
  assert.doesNotMatch(routes, /\/aprovacao\/manual/);
  assert.match(approvalCss, /purchase-approval-card\{display:none!important\}/);
  assert.doesNotMatch(routes, /compras\.aprovacao\.controller/);
});

test('compra valida aprovação digital por item e o payload aprovado no backend', () => {
  assert.match(routes, /requireApprovedPurchaseIntent/);
  assert.match(middleware, /assertPurchasePayloadMatchesApprovedItems/);
  assert.match(middleware, /assertAllQuotedApprovedForPurchase/);
  assert.match(itemService, /assertItemsApprovedForPurchase/);
  assert.match(itemService, /assertPurchasePayloadMatchesApprovedItems/);
  assert.match(itemService, /COMPRA_DIVERGE_DA_APROVACAO_ITEM/);
  assert.match(itemService, /ROLE\.ADMIN/);
  assert.match(itemService, /ROLE\.DIRETORIA/);
  assert.match(itemService, /AGUARDANDO_APROVACAO/);
  assert.match(itemService, /aprovacao_item_assinatura/);
});

test('tela operacional de Compras consulta aprovação dos itens e bloqueia seleção visualmente', () => {
  assert.match(routes, /\/solicitacoes\/:id\/aprovacao-itens\.json/);
  assert.match(js, /loadApprovalStates/);
  assert.match(js, /purchaseApproval/);
  assert.match(js, /approvalState === 'APROVADA'/);
  assert.match(js, /awaiting-purchase-approval/);
  assert.match(approvalCss, /AGUARDANDO APROVAÇÃO/);
  assert.match(show, /Aprovação digital:|compras-aprovacao-diretoria\.css/);
});
