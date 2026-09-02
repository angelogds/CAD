const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('migration cria reservas e identificação QR sem destruir tabelas', () => {
  const migration = read('database/migrations/180_almox_estoque_reservas_qr_colaboradores.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS estoque_reservas/);
  assert.match(migration, /qr_token/);
  assert.match(migration, /qr_ativo/);
  assert.match(migration, /retirado_por_colaborador_id/);
  assert.match(migration, /entregue_por_user_id/);
  assert.match(migration, /identificacao_origem/);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.doesNotMatch(migration, /DELETE FROM/i);
});

test('migration preserva retiradas históricas ao converter recebimentos em reservas', () => {
  const migration = read('database/migrations/180_almox_estoque_reservas_qr_colaboradores.js');
  assert.match(migration, /retiradaHistorica/);
  assert.match(migration, /solicitacao_item_id=si\.id/);
  assert.match(migration, /THEN ABS\(em\.quantidade\)/);
  assert.match(migration, /retiradaLimitada/);
  assert.match(migration, /WHEN \$\{retiradaLimitada\} >= COALESCE\(si\.qtd_recebida_total,0\) THEN 'RETIRADA'/);
  assert.match(migration, /SET reserva_id=\(/);
});

test('recebimento cria ou atualiza reserva da mesma solicitação', () => {
  const migration = read('database/migrations/180_almox_estoque_reservas_qr_colaboradores.js');
  assert.match(migration, /trg_estoque_reserva_recebimento_solicitacao/);
  assert.match(migration, /AFTER UPDATE OF qtd_recebida_total, estoque_item_id ON solicitacao_itens/);
  assert.match(migration, /ON CONFLICT\(solicitacao_item_id\) DO UPDATE/);
  assert.match(migration, /quantidade_reservada=excluded\.quantidade_reservada/);
});

test('saldo reservado fica protegido contra retirada avulsa', () => {
  const migration = read('database/migrations/180_almox_estoque_reservas_qr_colaboradores.js');
  const stockView = read('views/estoque/index.ejs');
  const outputView = read('views/estoque/saida_nova.ejs');

  assert.match(migration, /trg_estoque_proteger_saldo_reservado/);
  assert.match(migration, /Saldo reservado para solicitações não pode ser consumido por retirada avulsa/);
  assert.match(stockView, /Saldo físico/);
  assert.match(stockView, /Reservado/);
  assert.match(stockView, /Disponível livre/);
  assert.match(outputView, /saldo livre/i);
  assert.match(outputView, /saldo_disponivel/);
});

test('estoque possui visão separada por solicitação, OS e equipamento', () => {
  const routes = read('modules/estoque/estoque.routes.js');
  const view = read('views/estoque/reservas.ejs');
  const service = read('modules/estoque/estoque.reservas.service.js');

  assert.match(routes, /\/reservas/);
  assert.match(view, /Materiais separados/);
  assert.match(view, /OS #/);
  assert.match(view, /equipamento_nome/);
  assert.match(view, /Reservado/);
  assert.match(view, /Retirado/);
  assert.match(view, /Disponível/);
  assert.match(service, /groupBySolicitacao/);
  assert.match(service, /solicitacao_item_id/);
});

test('cartão QR reutiliza cadastro real do colaborador e não codifica PII', () => {
  const qrService = read('modules/colaboradores/colaboradores.qr.service.js');
  const card = read('views/colaboradores/cartao.ejs');
  const collaborators = read('modules/colaboradores/colaboradores.service.js');

  assert.match(collaborators, /foto_url/);
  assert.match(qrService, /crypto\.randomBytes\(24\)/);
  assert.match(qrService, /CGCOL:/);
  assert.doesNotMatch(qrService, /CPF|cpf|telefone_whatsapp/);
  assert.match(card, /colaborador\.foto_url/);
  assert.match(card, /Imprimir cartão/);
  assert.match(card, /Gerar novo QR/);
  assert.match(card, /Revogar cartão/);
});

test('rotas de cartão têm gestão restrita e colaborador ativo é obrigatório', () => {
  const routes = read('modules/colaboradores/colaboradores.routes.js');
  const qrService = read('modules/colaboradores/colaboradores.qr.service.js');

  assert.match(routes, /\/:id\/cartao/);
  assert.match(routes, /ADMIN/);
  assert.match(routes, /RH/);
  assert.match(routes, /ENCARREGADO_MANUTENCAO/);
  assert.match(qrService, /Somente colaboradores ativos podem receber cartão/);
  assert.match(qrService, /qr_ativo=0/);
});

test('retirada QR resolve identidade no servidor e audita colaborador e almoxarife', () => {
  const service = read('modules/estoque/estoque.reservas.service.js');
  const controller = read('modules/almoxarifado/retiradas-qr.controller.js');
  const routes = read('modules/almoxarifado/almoxarifado.routes.js');

  assert.match(service, /getColaboradorByQr\(qrCode\)/);
  assert.match(service, /retirado_por_colaborador_id/);
  assert.match(service, /entregue_por_user_id/);
  assert.match(service, /identificacao_origem: 'QR_COLABORADOR'/);
  assert.match(service, /qtd > disponivelReserva/);
  assert.match(service, /qtd > Number\(reserva\.saldo_fisico/);
  assert.match(controller, /entreguePorUserId: req\.session\.user\.id/);
  assert.match(routes, /reservas\/:reservaId\/retirar/);
  assert.match(routes, /ACCESS\.estoque_retirada/);
});

test('reserva é atualizada antes da baixa física para respeitar proteção de saldo', () => {
  const service = read('modules/estoque/estoque.reservas.service.js');
  const reservePos = service.indexOf('UPDATE estoque_reservas');
  const stockPos = service.indexOf('UPDATE estoque_itens SET saldo_atual');
  assert.ok(reservePos > 0, 'deve atualizar a reserva');
  assert.ok(stockPos > reservePos, 'a reserva deve ser reduzida antes do saldo físico');
  assert.match(service, /AND quantidade_retirada=\?/);
  assert.match(service, /AND COALESCE\(saldo_atual,0\)=\?/);
});

test('retirada contextual antiga sincroniza a reserva antes do saldo e continua rastreável', () => {
  const service = read('modules/estoque/estoque.service.js');
  const helperPos = service.indexOf('function atualizarReservaDaRetirada');
  const callPos = service.indexOf('atualizarReservaDaRetirada(contexto, qtd)');
  const stockPos = service.indexOf('UPDATE estoque_itens SET saldo_atual', callPos);
  assert.ok(helperPos > 0, 'deve existir compatibilidade com retirada contextual');
  assert.ok(callPos > helperPos, 'deve sincronizar a reserva durante a retirada');
  assert.ok(stockPos > callPos, 'deve reduzir a reserva antes do saldo físico');
  assert.match(service, /reserva_id: reserva\?\.id/);
  assert.match(service, /identificacao_origem: contexto \? 'CONTEXTO_SEM_QR'/);
});

test('scanner oferece câmera com fallback para leitor USB ou entrada manual', () => {
  const view = read('views/almoxarifado/retirada_qr.ejs');
  assert.match(view, /getUserMedia/);
  assert.match(view, /BarcodeDetector/);
  assert.match(view, /Leitor USB \/ código manual/);
  assert.match(view, /QR do cartão do colaborador/);
  assert.match(view, /Identifique um colaborador/);
});
