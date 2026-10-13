const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('V5 remove KPIs duplicados e concentra filtro e busca em uma única faixa', () => {
  const view = read('views','almoxarifado','recebimentos.ejs');
  assert.doesNotMatch(view, /almox-flow-kpis/);
  assert.doesNotMatch(view, /Acompanhamento, sem entrada/);
  assert.doesNotMatch(view, /Compras liberadas/);
  assert.match(view, /almox-compact-toolbar/);
  assert.match(view, /Buscar solicitação, material, equipamento ou fornecedor/);
  assert.match(view, /Não chegou/);
  assert.match(view, /Pendentes/);
});

test('V5 reduz a lista para cinco colunas operacionais', () => {
  const view = read('views','almoxarifado','recebimentos.ejs');
  assert.match(view, /Solicitação[\s\S]*Aplicação[\s\S]*Andamento[\s\S]*Fornecedor \/ previsão[\s\S]*Ação/);
  assert.doesNotMatch(view, />OS \/ Equipamento<\/span><span>Solicitante/);
  assert.doesNotMatch(view, /almox-flow-counts/);
  assert.doesNotMatch(view, /almox-dual-progress/);
  assert.match(view, /almox-compact-progress__track/);
  assert.match(view, /s\.solicitante_nome[\s\S]*s\.setor_origem/);
  assert.match(view, /s\.equipamento_nome \|\| 'Sem equipamento'/);
});

test('V13 exibe estágio físico para cada compra na lista unificada', () => {
  const view = read('views','almoxarifado','recebimentos.ejs');
  assert.match(view, /const showStatus=true/);
  assert.match(view, /situacao_recebimento/);
  assert.match(view, /if\(showStatus\)/);
  assert.match(view, /almox-status--mini/);
});

test('V5 mantém as ações críticas da operação', () => {
  const view = read('views','almoxarifado','recebimentos.ejs');
  assert.match(view, /tab: 'recebimentos'/);
  assert.doesNotMatch(view, /Saída avulsa/);
  assert.match(view, /iniciar-recebimento/);
  assert.match(view, />Receber<\/button>/);
  assert.match(view, /\/fechar/);
  assert.match(view, /\/reabrir/);
});

test('V5 compila e usa densidade compacta com tratamento mobile', () => {
  const view = read('views','almoxarifado','recebimentos.ejs');
  assert.doesNotThrow(() => ejs.compile(view,{filename:path.join(root,'views','almoxarifado','recebimentos.ejs')}));
  const css = read('public','css','almoxarifado-compact-v5.css');
  assert.match(css, /\.almox-compact-row\{padding:8px 12px/);
  assert.match(css, /grid-template-columns:minmax\(250px,1\.75fr\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.almox-compact-supplier\{display:none\}/);
});
