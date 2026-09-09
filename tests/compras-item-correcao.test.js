const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('correção de compra bloqueia item com recebimento do Almoxarifado', () => {
  const service = read('modules/compras/compras.item-correcao.service.js');
  assert.match(service, /qtd_recebida_total/);
  assert.match(service, /já possui recebimento no Almoxarifado/);
});

test('rota de correção não pode ser usada para criar uma nova compra', () => {
  const service = read('modules/compras/compras.item-correcao.service.js');
  assert.match(service, /comprado && !eraComprado/);
  assert.match(service, /use o fluxo normal de Compras e a aprovação aplicável/);
});

test('correção permite voltar comprado para cotado ou pendente sem apagar o item', () => {
  const service = read('modules/compras/compras.item-correcao.service.js');
  assert.match(service, /cotado \? 'COTADO' : 'PENDENTE'/);
  assert.match(service, /comprado \? 'COMPRADO' : 'PENDENTE'/);
  assert.match(service, /fornecedorId = null/);
  assert.match(service, /unitario = 0/);
  assert.match(service, /recalcularStatus/);
});

test('endpoint de correção mantém RBAC de compras_manage', () => {
  const routes = read('modules/compras/compras.routes.js');
  assert.match(routes, /\/solicitacoes\/:id\/itens\/:itemId\/corrigir-compra/);
  assert.match(routes, /requireRole\(ACCESS\.compras_manage\), itemCorrecaoCtrl\.corrigirItemCompra/);
});

test('botão Editar abre correção para comprado e preserva edição simples nos demais', () => {
  const script = read('public/js/compras-painel.js');
  assert.match(script, /state-comprado/);
  assert.match(script, /edit-purchased-item-dialog/);
  assert.match(script, /corrigir-compra/);
  assert.match(script, /row\.querySelector\('\.unit-price'\)\?\.focus\(\)/);
  assert.match(script, /recebimento registrado pelo Almoxarifado/);
});
