const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('V6 corrige a consulta de subcategorias que causava erro 500 por coluna ativo ambígua', () => {
  const service = read('modules','estoque','estoque.service.js');
  const start = service.indexOf('function listSubcategorias');
  const end = service.indexOf('function listLocais', start);
  const block = service.slice(start, end);
  assert.match(block, /sc\.ativo=1/);
  assert.match(block, /sc\.parent_id/);
  assert.doesNotMatch(block, /WHERE ativo=1/);
});

test('V6 mantém as ligações principais Almoxarifado, Estoque e Retirada em rotas reais', () => {
  const almoxRoutes = read('modules','almoxarifado','almoxarifado.routes.js');
  const estoqueRoutes = read('modules','estoque','estoque.routes.js');
  const tabs = read('views','almoxarifado','_tabs.ejs');

  assert.match(almoxRoutes, /router\.get\("\/estoque"[\s\S]*ctrl\.estoqueOperacional/);
  assert.match(almoxRoutes, /router\.get\("\/recebimentos"[\s\S]*ctrl\.recebimentos/);
  assert.match(almoxRoutes, /router\.get\("\/retiradas\/qr"[\s\S]*qrCtrl\.scanner/);
  assert.match(estoqueRoutes, /router\.get\("\/"[\s\S]*ctrl\.index/);
  assert.match(estoqueRoutes, /router\.get\("\/reservas"[\s\S]*reservasCtrl\.index/);
  assert.match(estoqueRoutes, /router\.get\("\/saidas\/nova"[\s\S]*ctrl\.saidaNova/);

  assert.match(tabs, /href="\/almoxarifado\/estoque"/);
  assert.match(tabs, /href="\/almoxarifado\/recebimentos\?fila=A_CAMINHO"/);
  assert.match(tabs, /href="\/almoxarifado\/recebimentos\?status=COMPRADA"/);
  assert.match(tabs, /href="\/estoque\/reservas"/);
  assert.match(tabs, /href="\/almoxarifado\/retiradas\/qr"/);
});

test('V6 deixa somente uma entrada de retirada no menu principal do Almoxarifado', () => {
  const tabs = read('views','almoxarifado','_tabs.ejs');
  const links = tabs.match(/href="\/almoxarifado\/retiradas\/qr"/g) || [];
  assert.equal(links.length, 1);
  assert.match(tabs, /> Retirada\s*<\/a>/);
  assert.doesNotMatch(tabs, /Saída avulsa/);
  assert.doesNotMatch(tabs, /Entrega identificada/);
});

test('V6 compacta a tela analítica do estoque sem remover inteligência de reposição', () => {
  const view = read('views','estoque','index.ejs');
  assert.match(view, /stock-v6-summary/);
  assert.match(view, /stock-v6-filter-form/);
  assert.match(view, /stock-v6-intelligence/);
  assert.match(view, /Inteligência de reposição/);
  assert.match(view, /stock-v6-row/);
  assert.doesNotMatch(view, /stock-sector-cards/);
  assert.doesNotMatch(view, /stock-flow-kpis/);
  assert.doesNotMatch(view, /stock-intelligence-grid/);
  assert.match(view, /Material[\s\S]*Organização[\s\S]*Saldo[\s\S]*Consumo[\s\S]*Reposição[\s\S]*Ação/);
});

test('V6 compacta a prateleira operacional e preserva organização física', () => {
  const view = read('views','almoxarifado','estoque.ejs');
  assert.match(view, /almox-stock-v6-list/);
  assert.match(view, /almox-stock-v6-row/);
  assert.match(view, /Organizar prateleira/);
  assert.match(view, /endereco_zona/);
  assert.match(view, /endereco_estante/);
  assert.match(view, /endereco_prateleira/);
  assert.match(view, /endereco_posicao/);
  assert.doesNotMatch(view, /almox-shelf/);
  assert.doesNotMatch(view, /Retirada avulsa/);
});

test('V6 simplifica retirada direta sem perder a saída manual rastreável', () => {
  const view = read('views','estoque','saida_nova.ejs');
  const routes = read('modules','estoque','estoque.routes.js');
  assert.match(view, /Retirada direta do estoque/);
  assert.doesNotMatch(view, /<section class="almox-kpis">/);
  assert.match(view, /name="item_id"/);
  assert.match(view, /name="quantidade"/);
  assert.match(view, /name="os_id" required/);
  assert.match(routes, /router\.post\("\/saidas"[\s\S]*almoxCtrl\.registrarSaida/);
});

test('V6 mantém telas principais compiláveis e responsivas', () => {
  for (const file of [
    ['views','almoxarifado','index.ejs'],
    ['views','almoxarifado','recebimentos.ejs'],
    ['views','almoxarifado','estoque.ejs'],
    ['views','almoxarifado','retirada_qr.ejs'],
    ['views','estoque','index.ejs'],
    ['views','estoque','saida_nova.ejs'],
  ]) {
    const source = read(...file);
    assert.doesNotThrow(() => ejs.compile(source,{filename:path.join(root,...file)}), file.join('/'));
  }
  const css = read('public','css','estoque-compact-v6.css');
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /min-height:40px/);
  assert.match(css, /stock-v6-row/);
  assert.match(css, /almox-stock-v6-row/);
});
