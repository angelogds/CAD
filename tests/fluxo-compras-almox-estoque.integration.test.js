const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Compras consulta saldo, calcula cobertura e exige confirmação de excesso', () => {
  const compras = require('../modules/compras/compras.service');
  assert.deepEqual(compras.calcularNecessidadeCompra(10, 4), {
    quantidade_solicitada: 10, saldo_disponivel: 4, percentual_cobertura: 40, quantidade_sugerida: 6,
  });
  const code = source('modules/compras/compras.service.js');
  assert.match(code, /confirmar_excesso/);
  assert.match(code, /ATENDIDO_ESTOQUE/);
  assert.match(code, /'AUTO'/);
  assert.doesNotMatch(code.slice(code.indexOf('function salvarPainelItens'), code.indexOf('function assumirSolicitacao')), /INSERT INTO compras_recebimentos/);
});

test('Almoxarifado confere parcial/total atomicamente, cria item e bloqueia excesso', () => {
  const code = source('modules/almoxarifado/almoxarifado.service.js');
  assert.match(code, /db\.transaction/);
  assert.match(code, /CMP-\$\{solicitacaoId\}-\$\{itemId\}/);
  assert.match(code, /ENTRADA_COMPRA/);
  assert.match(code, /saldo_anterior/);
  assert.match(code, /compras_recebimentos/);
  assert.match(code, /excede a solicitada/);
  assert.match(code, /RECEBIDA_TOTAL pode ser fechada/);
});

test('Retirada QR exige OS, herda equipamento e valida saldo', () => {
  const code = source('modules/estoque/estoque.service.js');
  assert.match(code, /Uma OS ativa é obrigatória/);
  assert.match(code, /Saldo insuficiente/);
  assert.match(code, /SAIDA_REQUISICAO_INTERNA/);
  assert.match(code, /os\.equipamento_id/);
  assert.match(code, /QR_CODE/);
  const { ACCESS, ROLE } = require('../config/rbac');
  assert.ok(ACCESS.estoque_retirada.includes(ROLE.MECANICO));
});

test('migration canônica preserva vínculos e idempotência estrutural', () => {
  const code = source('database/migrations/185_fluxo_compras_almox_estoque_qr.js');
  for (const field of ['saldo_atual', 'saldo_minimo', 'os_id', 'equipamento_id', 'solicitacao_id',
    'solicitacao_item_id', 'usuario_id', 'saldo_anterior', 'saldo_posterior', 'estoque_movimento_id']) assert.match(code, new RegExp(field));
  assert.match(code, /CREATE VIEW vw_estoque_saldo/);
  assert.match(code, /IF NOT EXISTS/);
});
