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

test('retirada por QR sincroniza a entrega depois da transação', () => {
  const service = read('modules/estoque/estoque.reservas.service.js');

  assert.match(service, /solicitacaoId: Number\(reserva\.solicitacao_id\)/);
  assert.match(service, /syncSolicitacaoEntregaStatus\(resultado\.solicitacaoId/);
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

test('reabertura preserva o estágio físico real do material', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');

  assert.match(service, /function reabrir\(id\)/);
  assert.match(service, /resumoReserva\.pendente > 0 \? STATUS\.SEPARADA_PARA_RETIRADA : STATUS\.ENTREGUE_SOLICITANTE/);
});

test('painel do Almoxarifado mostra separado, entregue e só fecha após entrega', () => {
  const list = read('views/almoxarifado/recebimentos.ejs');
  const detail = read('views/almoxarifado/conferir.ejs');

  assert.match(list, /Separadas/);
  assert.match(list, /Entregues/);
  assert.match(list, /s\.status === 'ENTREGUE_SOLICITANTE'/);
  assert.match(list, /s\.status === 'ENTREGUE_SOLICITANTE'.*\/fechar/s);

  assert.match(detail, /\['SEPARADA_PARA_RETIRADA','Separado'\]/);
  assert.match(detail, /\['ENTREGUE_SOLICITANTE','Entregue'\]/);
  assert.match(detail, /sol\.status==='ENTREGUE_SOLICITANTE'/);
  assert.match(detail, /Todos os materiais reservados foram entregues/);
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
