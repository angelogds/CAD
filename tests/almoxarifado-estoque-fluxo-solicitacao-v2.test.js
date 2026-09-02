const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('almoxarifado acompanha a mesma solicitação desde a cotação', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');
  const view = read('views/almoxarifado/recebimentos.ejs');

  assert.match(service, /STATUS\.EM_COTACAO/);
  assert.match(service, /ALMOX_STATUS/);
  assert.match(view, /Solicitações no Almoxarifado/);
  assert.match(view, /solicitados/);
  assert.match(view, /cotados/);
  assert.match(view, /comprados/);
  assert.match(view, /recebidos/);
});

test('item comprado pode ser recebido mesmo com solicitacao geral ainda em cotacao', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');
  const view = read('views/almoxarifado/conferir.ejs');

  assert.match(service, /STATUS_PERMITIDOS_RECEBIMENTO_ITEM[\s\S]*STATUS\.EM_COTACAO/);
  assert.match(service, /status_compra[\s\S]{0,120}COMPRADO/);
  assert.match(service, /\[STATUS\.COMPRADA, STATUS\.REABERTA\]\.includes\(statusSolicitacao\)/);
  assert.match(view, /canReceiveInCurrentStatus/);
  assert.match(view, /canReceiveItem=canManage&&canReceiveInCurrentStatus&&purchased&&aReceber>0/);
  assert.match(view, /Receber material/);
  assert.match(view, /Confirmar recebimento/);
  assert.doesNotMatch(view, /editableReceipt/);
});

test('detalhe da solicitacao mostra todos os itens e só recebe item comprado', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');
  const view = read('views/almoxarifado/conferir.ejs');

  assert.match(service, /WHERE si\.solicitacao_id=\?/);
  assert.match(service, /Somente itens marcados como COMPRADO pelo setor de Compras podem ser recebidos/);
  assert.match(service, /Quantidade acima do que ainda falta receber/);
  assert.match(view, /Acompanhamento do material desde a cotação até a retirada/);
  assert.match(view, /Fornecedor:/);
  assert.match(view, /Previsão:/);
  assert.match(view, /Quantidade recebida agora/);
});

test('semantica de recebimento usa a receber antes e faltante somente depois de recebimento parcial', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');
  const view = read('views/almoxarifado/conferir.ejs');

  assert.match(service, /divergencia_recebimento: comprado && recebida > 0 && aReceber > 0/);
  assert.match(view, /partialReceipt=Boolean\(item\.divergencia_recebimento\)/);
  assert.match(view, /partialReceipt \? 'Faltante' : 'A receber'/);
  assert.match(view, /Recebimento parcial/);
  assert.doesNotMatch(view, /<small>Pendente<\/small>/);
});

test('compras apenas acompanha recebimento e alerta automaticamente quando material chega faltando', () => {
  const purchaseView = read('views/compras/solicitacoes/show.ejs');
  const dashboardView = read('views/compras/solicitacoes/index.ejs');
  const dashboardService = read('modules/compras/compras.dashboard.service.js');

  assert.doesNotMatch(purchaseView, /name="qtd_recebida"/);
  assert.match(purchaseView, /quantidade recebida é somente leitura/);
  assert.match(purchaseView, /ALERTA DO ALMOXARIFADO/);
  assert.match(purchaseView, /Faltante/);
  assert.match(dashboardView, /Material recebido com quantidade menor que a comprada/);
  assert.match(dashboardService, /receivedQty}>0 AND \$\{receivedQty}<\$\{boughtQty}/);
  assert.match(dashboardService, /receiptShortages/);
  assert.match(dashboardService, /receiptShortageQty/);
});

test('alerta de compras é derivado dos dados e some quando o recebimento completa', () => {
  const dashboardService = read('modules/compras/compras.dashboard.service.js');

  assert.match(dashboardService, /partialReceiptPredicate/);
  assert.match(dashboardService, /receiptShortages = rows[\s\S]*itens_divergentes_recebimento/);
  assert.doesNotMatch(dashboardService, /INSERT INTO .*alert/i);
  assert.doesNotMatch(dashboardService, /CREATE TABLE .*alert/i);
});

test('retirada contextual permanece vinculada à solicitação, OS e equipamento e passa por identificação QR', () => {
  const stock = read('modules/estoque/estoque.service.js');
  const reservationStock = read('modules/estoque/estoque.reservas.service.js');
  const routes = read('modules/almoxarifado/almoxarifado.routes.js');
  const detail = read('views/almoxarifado/conferir.ejs');

  assert.match(stock, /solicitacao_id/);
  assert.match(stock, /solicitacao_item_id/);
  assert.match(stock, /equipamento_id/);
  assert.match(stock, /Uma OS ativa é obrigatória para registrar uma retirada manual/);
  assert.match(reservationStock, /retirado_por_colaborador_id/);
  assert.match(reservationStock, /entregue_por_user_id/);
  assert.match(routes, /retiradas\/qr/);
  assert.match(routes, /reservas\/:reservaId\/retirar/);
  assert.match(detail, /Entregar materiais por QR/);
  assert.match(detail, /Entregar por QR/);
  assert.doesNotMatch(detail, />Dar baixa \/ retirar</);
});

test('migration preserva dados e adiciona somente rastreabilidade necessária', () => {
  const migration = read('database/migrations/156_almoxarifado_retirada_solicitacao.js');
  assert.match(migration, /addColumnIfMissing\('estoque_movimentos', 'solicitacao_id'/);
  assert.match(migration, /addColumnIfMissing\('estoque_movimentos', 'solicitacao_item_id'/);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.doesNotMatch(migration, /DELETE FROM/i);
});

test('estoque usa painel padronizado com filtros e status de saldo', () => {
  const view = read('views/estoque/index.ejs');
  const controller = read('modules/estoque/estoque.controller.js');
  assert.match(view, /ESTOQUE • ALMOXARIFADO DA MANUTENÇÃO/);
  assert.match(view, /Saldo físico/);
  assert.match(view, /Reservado/);
  assert.match(view, /Disponível livre/);
  assert.match(view, /Abaixo do mínimo/);
  assert.match(view, /Estoque zerado/);
  assert.match(view, /Último movimento/);
  assert.match(controller, /situacao/);
  assert.match(controller, /categoria_id/);
  assert.match(controller, /local_id/);
  assert.match(controller, /saldo_reservado/);
  assert.match(controller, /saldo_disponivel/);
});