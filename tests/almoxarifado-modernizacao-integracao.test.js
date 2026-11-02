const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('almoxarifado usa o fluxo real de retirada do estoque sem duplicar rota avulsa', () => {
  const tabs = read('views', 'almoxarifado', '_tabs.ejs');
  const estoqueRoutes = read('modules', 'estoque', 'estoque.routes.js');
  const almoxRoutes = read('modules', 'almoxarifado', 'almoxarifado.routes.js');

  assert.match(tabs, /\/almoxarifado\/retiradas\/qr/);
  assert.doesNotMatch(tabs, /\/estoque\/saidas\/nova\?contexto=almoxarifado/);
  assert.match(estoqueRoutes, /router\.post\("\/saidas"[\s\S]*almoxCtrl\.registrarSaida/);
  assert.doesNotMatch(almoxRoutes, /post\("\/retiradas"/);
  assert.match(almoxRoutes, /itens\/:itemId\/retirar/);
});

test('central oferece busca, abertas e fechadas sem ações manuais de encerramento', () => {
  const view=read('views','almoxarifado','recebimentos.ejs');
  assert.match(view,/name="q"/);assert.match(view,/Abertas/);assert.match(view,/Fechadas/);
  assert.doesNotMatch(view,/\/fechar|\/reabrir|iniciar-recebimento/);
});

test('conferência limita ao restante; organização física fica na prateleira', () => {
  const view = read('views', 'almoxarifado', '_itens-recebimento.ejs');
  const service = read('modules', 'almoxarifado', 'almoxarifado.service.js');

  assert.match(view, /max="<%=aReceber%>"/);
  assert.match(read('views','almoxarifado','estoque.ejs'),/name="endereco_prateleira"/);
  assert.match(service, /quantidade > aReceber/);
  assert.match(service, /Local de estoque inválido ou inativo/);
  assert.match(service, /ENTRADA_COMPRA/);
  assert.match(service, /origem:[\s\S]{0,80}"COMPRA"/);
});

test('entrada de compra reaproveita item vinculado ou correspondencia exata unica antes de cadastrar outro', () => {
  const service = read('modules', 'almoxarifado', 'almoxarifado.service.js');

  assert.match(service, /item\.estoque_item_id/);
  assert.match(service, /LOWER\(TRIM\(nome\)\)=LOWER\(TRIM\(\?\)\)/);
  assert.match(service, /if \(matches\.length === 1\)/);
  assert.match(service, /CMP-\$\{solicitacaoId\}-\$\{item\.id\}/);
});

test('reabertura preserva estoque e retorna o fluxo ao estado coerente', () => {
  const service = read('modules', 'almoxarifado', 'almoxarifado.service.js');

  assert.match(service, /s\.status === STATUS\.FECHADA \? STATUS\.RECEBIDA_TOTAL : STATUS\.EM_RECEBIMENTO/);
  const reabrirBody = service.slice(service.indexOf('function reabrir'), service.indexOf('module.exports'));
  assert.doesNotMatch(reabrirBody, /estoque_movimentos/);
  assert.doesNotMatch(reabrirBody, /saldo_atual/);
});

test('retirada avulsa mantém OS obrigatória e retirada por solicitação mantém a origem', () => {
  const view = read('views', 'estoque', 'saida_nova.ejs');
  const estoqueService = read('modules', 'estoque', 'estoque.service.js');

  assert.match(view, /name="os_id" required/);
  assert.match(view, /data-stock-item-select/);
  assert.match(view, /name="contexto" value="almoxarifado"/);
  assert.match(estoqueService, /Uma OS ativa é obrigatória/);
  assert.match(estoqueService, /SAIDA_REQUISICAO_INTERNA/);
  assert.match(estoqueService, /const posterior = anterior - qtd/);
  assert.match(estoqueService, /solicitacao_item_id/);
  assert.match(estoqueService, /origem: contexto \? 'SOLICITACAO'/);
});

test('views do almoxarifado compartilham o novo pacote visual responsivo', () => {
  for (const file of ['index.ejs', 'recebimentos.ejs', 'conferir.ejs']) {
    const view = read('views', 'almoxarifado', file);
    assert.match(view, /include\('_tabs'/);
    assert.match(view, /almox-central/);
  }
  const css = read('public', 'css', 'almox-central.css');
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /ac-workspace/);
});