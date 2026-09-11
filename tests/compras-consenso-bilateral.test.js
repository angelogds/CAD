const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const routes = fs.readFileSync(path.join(root, 'modules/compras/compras.routes.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'modules/compras/compras.itens-consenso.controller.js'), 'utf8');
const guard = fs.readFileSync(path.join(root, 'modules/compras/compras.consenso.middleware.js'), 'utf8');
const notifications = fs.readFileSync(path.join(root, 'modules/compras/compras.consenso-notificacoes.service.js'), 'utf8');
const bilateral = fs.readFileSync(path.join(root, 'modules/solicitacoes/solicitacoes.itens-bilateral.service.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public/js/compras-demandas-pre-cotacao.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/js/compras-consenso-bilateral.js'), 'utf8');

test('Compras recebe e responde alterações criadas pelo solicitante', () => {
  assert.match(routes, /\/consenso-itens\/pendentes\.json/);
  assert.match(routes, /\/solicitacoes\/:id\/consenso-itens\.json/);
  assert.match(routes, /\/solicitacoes\/:id\/itens\/:itemId\/alteracao\/aprovar/);
  assert.match(routes, /\/solicitacoes\/:id\/itens\/:itemId\/alteracao\/recusar/);
  assert.match(controller, /bilateralService\.getAlteracoes/);
  assert.match(controller, /bilateralService\.canAnswer/);
  assert.match(notifications, /a\.solicitada_por_user_id=s\.solicitante_user_id/);
});

test('Compras também pode propor ajuste ao solicitante sem permitir autoaprovação', () => {
  assert.match(routes, /\/solicitacoes\/:id\/itens\/:itemId\/alteracao'/);
  assert.match(controller, /actorSide\(base, req\.session\.user\) !== 'COMPRAS'/);
  assert.match(controller, /bilateralService\.solicitarAlteracao/);
  assert.match(bilateral, /Quem solicitou a alteração não pode aprovar a própria solicitação/);
  assert.match(bilateral, /Esta decisão precisa ser confirmada pelo solicitante original/);
});

test('compra fica bloqueada no backend enquanto a quantidade aguarda consenso', () => {
  assert.match(routes, /blockAnyPendingAlteration/);
  assert.match(routes, /blockSelectedPendingAlteration/);
  assert.match(guard, /solicitacao_item_alteracoes/);
  assert.match(guard, /status='PENDENTE'/);
  assert.match(guard, /Compra bloqueada: existe alteração de quantidade aguardando consenso/);
});

test('interface de Compras exibe notificação, decisão e ajuste de quantidade', () => {
  assert.match(loader, /compras-consenso-bilateral\.js/);
  assert.match(ui, /Alterações aguardando confirmação/);
  assert.match(ui, /Aprovar alteração/);
  assert.match(ui, /Ajustar qtd\./);
  assert.match(ui, /consenso-itens\/pendentes\.json/);
  assert.match(ui, /topbar-counter/);
  assert.match(ui, /purchase-consensus-notice-panel/);
});
