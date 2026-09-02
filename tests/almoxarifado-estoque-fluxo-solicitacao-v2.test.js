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

test('detalhe da solicitação mostra todos os itens e só recebe item comprado', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');
  const view = read('views/almoxarifado/conferir.ejs');

  assert.match(service, /WHERE si\.solicitacao_id=\?/);
  assert.match(service, /Somente itens realmente comprados podem ser recebidos/);
  assert.match(service, /Quantidade acima do saldo pendente/);
  assert.match(view, /Acompanhamento do material desde a cotação até a retirada/);
  assert.match(view, /Fornecedor:/);
  assert.match(view, /Previsão:/);
  assert.match(view, /Dar entrada/);
});

test('retirada contextual permanece vinculada à solicitação, OS e equipamento', () => {
  const stock = read('modules/estoque/estoque.service.js');
  const routes = read('modules/almoxarifado/almoxarifado.routes.js');
  const detail = read('views/almoxarifado/conferir.ejs');

  assert.match(stock, /solicitacao_id/);
  assert.match(stock, /solicitacao_item_id/);
  assert.match(stock, /equipamento_id/);
  assert.match(stock, /registrarSaidasSolicitacao/);
  assert.match(stock, /Uma OS ativa é obrigatória para registrar uma retirada manual/);
  assert.match(routes, /retirar-todos/);
  assert.match(routes, /itens\/:itemId\/retirar/);
  assert.match(detail, /Dar baixa \/ retirar/);
  assert.match(detail, /Retirar todos disponíveis/);
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
  assert.match(view, /Abaixo do mínimo/);
  assert.match(view, /Estoque zerado/);
  assert.match(view, /Último movimento/);
  assert.match(controller, /situacao/);
  assert.match(controller, /categoria_id/);
  assert.match(controller, /local_id/);
});
