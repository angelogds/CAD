const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('status físicos separado e entregue entram nos filtros de Solicitações', () => {
  const service = read('modules/solicitacoes/solicitacoes.service.js');
  const view = read('views/solicitacoes/minhas.ejs');

  assert.match(service, /STATUS\.SEPARADA_PARA_RETIRADA/);
  assert.match(service, /STATUS\.ENTREGUE_SOLICITANTE/);
  assert.match(service, /SEPARADA_PARA_RETIRADA','ENTREGUE_SOLICITANTE/);
  assert.match(view, /SEPARADA_PARA_RETIRADA:'Separada para retirada'/);
  assert.match(view, /ENTREGUE_SOLICITANTE:'Entregue ao solicitante'/);
});

test('fluxo de estoque calcula reservas e promove status físico da solicitação', () => {
  const flow = read('modules/estoque/estoque.solicitacao-fluxo.service.js');

  assert.match(flow, /function getResumoReservas/);
  assert.match(flow, /quantidade_reservada/);
  assert.match(flow, /quantidade_retirada/);
  assert.match(flow, /STATUS\.SEPARADA_PARA_RETIRADA/);
  assert.match(flow, /STATUS\.ENTREGUE_SOLICITANTE/);
  assert.match(flow, /resumo\.pendente <= 0/);
  assert.match(flow, /UPDATE solicitacoes SET status=/);
});

test('retirada por QR sincroniza a entrega na mesma transação', () => {
  const service = read('modules/estoque/estoque.reservas.service.js');

  assert.match(service, /solicitacaoId: Number\(reserva\.solicitacao_id\)/);
  assert.match(service, /syncSolicitacaoEntregaStatus\(reserva\.solicitacao_id/);
  assert.match(service, /solicitacaoStatus: fluxo\.status/);
});

test('baixa contextual sem QR também sincroniza o status da solicitação', () => {
  const service = read('modules/estoque/estoque.service.js');

  assert.match(service, /function registrarSaida\(data\)/);
  assert.match(service, /syncSolicitacaoEntregaStatus\(data\.solicitacao_id/);
  assert.match(service, /function registrarSaidasSolicitacao/);
  assert.match(service, /syncSolicitacaoEntregaStatus\(solicitacao_id/);
});

test('recebimento integral promove material para separado quando existe reserva', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');

  assert.match(service, /function finalizarRecebimento/);
  assert.match(service, /status === STATUS\.RECEBIDA_TOTAL/);
  assert.match(service, /syncSolicitacaoEntregaStatus\(id\)/);
  assert.match(service, /STATUS\.SEPARADA_PARA_RETIRADA/);
  assert.match(service, /STATUS\.ENTREGUE_SOLICITANTE/);
});

test('fechamento não pode ignorar material reservado ainda não entregue', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');

  assert.match(service, /function fechar\(id\)/);
  assert.match(service, /getResumoReservas\(id\)/);
  assert.match(service, /reservas\.reservado > 0 && reservas\.pendente > 0/);
  assert.match(service, /Ainda existem materiais reservados aguardando entrega ao solicitante/);
});

test('reabertura de solicitação encerrada é recusada', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');

  assert.match(service, /function reabrir\(id\)/);
  assert.match(service, /Solicitações encerradas não podem ser reabertas/);
});

test('encerramento do recebimento preserva fila de entrega e fechamento histórico protegido', () => {
  const menu=read('views/almoxarifado/_stock-operations.ejs');
  assert.match(menu,/Materiais separados/);assert.match(read('views/estoque/reservas.ejs'),/A retirar/);
  const almox=read('modules/almoxarifado/almoxarifado.service.js');
  assert.match(almox,/Ainda existem materiais reservados aguardando entrega/);
  assert.match(read('views/almoxarifado/conferir.ejs'),/retiradas\/qr\?solicitacao_id=/);
});

test('mudança de status registra histórico na OS quando houver vínculo', () => {
  const flow = read('modules/estoque/estoque.solicitacao-fluxo.service.js');

  assert.match(flow, /registrarMensagemSistema/);
  assert.match(flow, /MATERIAL_SEPARADO/);
  assert.match(flow, /MATERIAL_ENTREGUE/);
  assert.match(flow, /sol\.os_id/);
});

test('views do Almoxarifado continuam EJS válidas', () => {
  for (const file of ['views/almoxarifado/recebimentos.ejs', 'views/almoxarifado/conferir.ejs']) {
    const source = read(file);
    assert.doesNotThrow(() => ejs.compile(source, { filename: path.join(root, file) }));
  }
});
