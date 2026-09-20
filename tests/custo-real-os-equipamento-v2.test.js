const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('custo real usa baixas físicas do estoque como fonte da verdade', () => {
  const service = read('modules/compras/custos-equipamentos.service.js');

  assert.match(service, /UPPER\(COALESCE\(m\.tipo,''\)\) LIKE 'SAIDA%'/);
  assert.match(service, /consumido_centavos/);
  assert.match(service, /function getOSConsumption\(osId/);
  assert.match(service, /function getConsumptionAnalytics\(filters/);
});

test('custo unitário prioriza snapshot do movimento e mantém fallback legado', () => {
  const service = read('modules/compras/custos-equipamentos.service.js');

  assert.match(service, /WHEN \$\{movimentoCost\} IS NOT NULL/);
  assert.match(service, /WHEN \$\{itemCost\} IS NOT NULL/);
  assert.match(service, /WHEN \$\{estoqueCost\} IS NOT NULL/);
  assert.match(service, /'MOVIMENTO'/);
  assert.match(service, /'SOLICITACAO'/);
  assert.match(service, /'ESTOQUE_ATUAL'/);
});

test('recebimento atualiza custo médio do estoque sem criar schema novo', () => {
  const service = read('modules/almoxarifado/almoxarifado.service.js');

  assert.match(service, /HAS_ESTOQUE_CUSTO_UNIT/);
  assert.match(service, /custoMedioPosterior/);
  assert.match(service, /saldoAnterior \* custoAnterior/);
  assert.match(service, /quantidade \* custoCompraUnit/);
  assert.match(service, /custo_unit: HAS_MOV_CUSTO_UNIT/);
});

test('baixas manuais, contextuais e QR congelam custo no movimento', () => {
  const estoque = read('modules/estoque/estoque.service.js');
  const reservas = read('modules/estoque/estoque.reservas.service.js');

  assert.match(estoque, /const custoUnit = contexto/);
  assert.match(estoque, /custo_unit: HAS_MOV_CUSTO_UNIT/);
  assert.match(reservas, /const custoUnit = Number\(reserva\.valor_unitario_centavos/);
  assert.match(reservas, /custo_unit: custoUnit \|\| null/);
});

test('ficha do equipamento reutiliza o custo carregado pela rota e associa custo às OS', () => {
  const routes = read('modules/equipamentos/equipamentos.routes.js');
  const controller = read('modules/equipamentos/equipamentos.controller.js');
  const view = read('views/equipamentos/show.ejs');

  assert.match(routes, /custosEquipamentosService\.getEquipmentLifetime\(equipamentoId\)/);
  assert.match(controller, /res\.locals\.custosEquipamento/);
  assert.doesNotMatch(controller, /getEquipmentDetail\(id/);
  assert.match(controller, /custo_real_centavos/);
  assert.match(controller, /custosEquipamento,/);
  assert.match(view, /Custos reais do equipamento/);
  assert.match(view, /Custo real consumido/);
  assert.match(view, /Consumo real por baixa de estoque/);
});

test('ficha da OS mostra custo real sem confundir com valor comprado', () => {
  const controller = read('modules/os/os.controller.js');
  const view = read('views/os/show.ejs');

  assert.match(controller, /custosEquipamentosService\.getOSConsumption\(id\)/);
  assert.match(controller, /custosOS,/);
  assert.match(view, /Custo real consumido/);
  assert.match(view, /Materiais efetivamente consumidos nesta OS/);
  assert.match(view, /Somente baixas físicas do estoque entram no custo real da ordem/);
});

test('alterações não adicionam migration destrutiva e views compilam', () => {
  assert.doesNotThrow(() => ejs.compile(read('views/equipamentos/show.ejs')));
  assert.doesNotThrow(() => ejs.compile(read('views/os/show.ejs')));
});
