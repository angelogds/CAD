const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('migration preserva itens e cria auditoria de consenso sem exclusão destrutiva', () => {
  const code = read('database/migrations/189_compras_itens_consenso_extras.js');
  assert.match(code, /origem_item/);
  assert.match(code, /exclusao_status/);
  assert.match(code, /CREATE TABLE IF NOT EXISTS solicitacao_item_exclusoes/);
  assert.match(code, /snapshot_json/);
  assert.match(code, /WHERE status='PENDENTE'/);
  assert.doesNotMatch(code, /DROP TABLE/i);
  assert.doesNotMatch(code, /DELETE FROM\s+solicitacao_itens/i);
});

test('Compras solicita exclusão mas não apaga o item antes do aceite do solicitante', () => {
  const code = read('modules/compras/compras.itens-consenso.service.js');
  assert.match(code, /solicitarExclusao/);
  assert.match(code, /EXCLUSAO\.PENDENTE/);
  assert.match(code, /Somente o solicitante original pode responder/);
  assert.match(code, /status_compra='CANCELADO'/);
  assert.match(code, /qtd_recebida_total/);
  assert.match(code, /COMPRADO.*ATENDIDO_ESTOQUE/s);
  assert.doesNotMatch(code, /DELETE FROM\s+solicitacao_itens/i);
});

test('item excepcional entra na mesma solicitacao e pode seguir como cotação ou comprado', () => {
  const code = read('modules/compras/compras.itens-consenso.service.js');
  assert.match(code, /ORIGEM_ITEM\.COMPRAS_EXTRA/);
  assert.match(code, /INSERT INTO solicitacao_itens/);
  assert.match(code, /solicitacao_id/);
  assert.match(code, /modo === 'COMPRADO'/);
  assert.match(code, /status_cotacao/);
  assert.match(code, /status_compra/);
  assert.match(code, /adicao_justificativa/);
});

test('rotas separam poder de Compras da decisão do solicitante', () => {
  const comprasRoutes = read('modules/compras/compras.routes.js');
  const solicitacoesRoutes = read('modules/solicitacoes/solicitacoes.routes.js');
  assert.match(comprasRoutes, /itens\/:itemId\/exclusao/);
  assert.match(comprasRoutes, /ACCESS\.compras_manage/);
  assert.match(comprasRoutes, /itens-excepcionais/);
  assert.match(solicitacoesRoutes, /exclusao\/aprovar/);
  assert.match(solicitacoesRoutes, /exclusao\/recusar/);
  assert.match(solicitacoesRoutes, /flowCtrl\.detalhe/);
});

test('detalhe de Compras usa botões padronizados, exclusão consensual e card de item extra', () => {
  const view = read('views/compras/solicitacoes/show.ejs');
  assert.match(view, /ui-btn ui-btn--table edit-item/);
  assert.match(view, /js-request-item-delete/);
  assert.match(view, /EXCLUSÃO COM CONSENSO/);
  assert.match(view, /Adicionar item fora da solicitação original/);
  assert.match(view, /adicao_justificativa/);
  assert.match(view, /Itens removidos por consenso/);
  assert.doesNotThrow(() => ejs.compile(view, { filename: path.join(root, 'views/compras/solicitacoes/show.ejs') }));
});

test('solicitante recebe decisão explícita e vê origem/histórico dos itens', () => {
  const view = read('views/solicitacoes/show.ejs');
  assert.match(view, /Confirmar exclusão/);
  assert.match(view, /Manter item/);
  assert.match(view, /Adicionado por Compras/);
  assert.match(view, /Removido por consenso/);
  assert.doesNotThrow(() => ejs.compile(view, { filename: path.join(root, 'views/solicitacoes/show.ejs') }));
});

test('fila principal de Compras usa cinco colunas coerentes com a marcação atual', () => {
  const css = read('public/css/compras-active-priority-fix.css');
  assert.match(css, /CINCO blocos por linha/);
  assert.match(css, /grid-template-columns:minmax\(225px,1\.3fr\).*minmax\(124px,\.62fr\)/s);
  assert.match(css, /min-width:1040px/);
});

test('contadores operacionais ignoram itens removidos por consenso', () => {
  const controller = read('modules/compras/compras.controller.js');
  assert.match(controller, /function applyActiveItemCounters/);
  assert.match(controller, /status_compra,''\)<>\'CANCELADO\'/);
  assert.match(controller, /itens_count/);
  assert.match(controller, /itens_cotados/);
  assert.match(controller, /itens_comprados/);
  assert.match(controller, /itens_recebidos/);
});
