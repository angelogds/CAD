const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'views/layout.ejs'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public/js/compras-itens-liberados-dashboard.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'modules/compras/compras.routes.js'), 'utf8');
const approvalController = fs.readFileSync(path.join(root, 'modules/compras/compras.aprovacao-itens.controller.js'), 'utf8');
const approvalService = fs.readFileSync(path.join(root, 'modules/compras/compras.aprovacao-itens.service.js'), 'utf8');
const releasedService = fs.readFileSync(path.join(root, 'modules/compras/compras.liberados-dashboard.service.js'), 'utf8');

test('painel de Compras carrega sinalização de itens aprovados pela Diretoria', () => {
  assert.match(layout, /compras-itens-liberados-dashboard\.js/);
  assert.match(script, /LIBERADOS P\/ COMPRA/);
  assert.match(script, /Itens aprovados pela Diretoria aguardando compra/);
  assert.match(script, /item liberado/);
  assert.match(script, /Comprar item liberado/);
});

test('painel usa resumo global e mantém fallback por solicitação', () => {
  assert.match(routes, /\/itens-liberados\.json/);
  assert.match(script, /\/compras\/itens-liberados\.json/);
  assert.match(script, /\/aprovacao-itens\.json/);
  assert.match(approvalController, /liberadosDashboardJson/);
  assert.match(releasedService, /totalSolicitacoesLiberadas/);
  assert.match(releasedService, /totalItensLiberados/);
});

test('cada solicitação recebe contagem individual de liberados e aguardando Diretoria', () => {
  assert.match(releasedService, /liberados: 0/);
  assert.match(releasedService, /aguardando: 0/);
  assert.match(script, /row\.liberados/);
  assert.match(script, /row\.aguardando/);
  assert.match(script, /Sem itens liberados no momento/);
});

test('somente aprovação válida e ainda não comprada é contabilizada como liberada', () => {
  assert.match(approvalService, /approvalState === ITEM_APPROVAL\.APPROVED/);
  assert.match(releasedService, /purchaseStatus === 'COMPRADO'/);
  assert.match(releasedService, /purchaseStatus === 'CANCELADO'/);
  assert.match(releasedService, /aprovacao_item_assinatura/);
  assert.match(releasedService, /itemApprovalService\.itemSignature\(item\)/);
});

test('fila visual distingue liberado, aguardando Diretoria e sem liberação', () => {
  assert.match(script, /is-director-released/);
  assert.match(script, /aguardando.*Diretoria/i);
  assert.match(script, /Sem itens liberados no momento/);
  assert.match(script, /Ver liberados desta página/);
});
