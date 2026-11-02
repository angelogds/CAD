const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ejs = require('ejs');
const Database = require('better-sqlite3');
const express = require('express');

const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
const dbPath = require.resolve('../database/db');
const previousDb = require.cache[dbPath];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const configuration = require('../modules/compras/compras.configuracao.service');
const approvals = require('../modules/compras/compras.aprovacao-itens.service');
const guard = require('../modules/compras/compras.aprovacao.middleware');
const dashboard = require('../modules/compras/compras.liberados-dashboard.service');
const adminRouter = require('../modules/admin/perfis.routes');
const migration = require('../database/migrations/239_compras_diretoria_configuravel');
const admin = { id: 1, role: 'ADMIN' };
const director = { id: 2, role: 'DIRETORIA' };
const buyer = { id: 3, role: 'COMPRAS' };
const setMode = value => configuration.setApprovalRequired({ perfil: 'DIRETORIA', obrigatoria: value, user: admin });
const payload = { item_id: ['10'], fornecedor_id: ['1'], valor_unitario: ['10,00'], cotado: ['10'], comprar: ['10'], acao: 'comprar' };

test.beforeEach(() => {
  db.exec(`
    DROP TRIGGER IF EXISTS fail_configuration_history;
    DROP TABLE IF EXISTS config_sistema_historico;
    DROP TABLE IF EXISTS config_sistema;
    DROP TABLE IF EXISTS compras_aprovacoes_itens_historico;
    DROP TABLE IF EXISTS solicitacao_itens;
    DROP TABLE IF EXISTS solicitacoes;
    DROP TABLE IF EXISTS demandas;
    DROP TABLE IF EXISTS fornecedores;
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, role TEXT);
    INSERT INTO users VALUES (1,'Admin teste','ADMIN'),(2,'Diretor teste','DIRETORIA'),(3,'Comprador teste','COMPRAS');
    CREATE TABLE fornecedores (id INTEGER PRIMARY KEY, nome TEXT);
    INSERT INTO fornecedores VALUES (1,'Fornecedor teste');
    CREATE TABLE solicitacoes (id INTEGER PRIMARY KEY, numero TEXT, status TEXT);
    INSERT INTO solicitacoes VALUES (7,'SC-TESTE','EM_COTACAO');
    CREATE TABLE solicitacao_itens (
      id INTEGER PRIMARY KEY, solicitacao_id INTEGER, item_nome TEXT,
      item_descricao TEXT, qtd_solicitada REAL, unidade TEXT, fornecedor_id INTEGER,
      valor_unitario_centavos INTEGER, status_cotacao TEXT, status_compra TEXT, qtd_comprada REAL,
      aprovacao_item_status TEXT DEFAULT 'NAO_SOLICITADA', aprovacao_item_por_user_id INTEGER,
      aprovacao_item_em TEXT, aprovacao_item_assinatura TEXT, aprovacao_item_valor_centavos INTEGER
    );
    INSERT INTO solicitacao_itens (id,solicitacao_id,item_nome,qtd_solicitada,unidade,fornecedor_id,valor_unitario_centavos,status_cotacao,status_compra)
      VALUES (10,7,'Material teste',2,'UN',1,1000,'COTADO','PENDENTE');
    CREATE TABLE compras_aprovacoes_itens_historico (
      id INTEGER PRIMARY KEY, solicitacao_id INTEGER, solicitacao_item_id INTEGER,
      acao TEXT, executado_por_user_id INTEGER, valor_centavos INTEGER,
      cotacao_assinatura TEXT, observacao TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  migration({ db });
});

test.after(() => {
  if (previousDb) require.cache[dbPath] = previousDb;
  else delete require.cache[dbPath];
  db.close();
});

test('migration inicia desligado, preserva configuração posterior, itens e aprovações', () => {
  assert.equal(configuration.isApprovalRequired(), false);
  setMode('1');
  migration({ db });
  assert.equal(configuration.isApprovalRequired(), true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM solicitacao_itens').get().n, 1);
  assert.equal(db.prepare('SELECT aprovacao_item_status status FROM solicitacao_itens').get().status, 'NAO_SOLICITADA');
  assert.equal(configuration.getHistory().length, 1);
});

test('configuração ausente ou inválida mantém aprovação obrigatória', () => {
  db.prepare('UPDATE config_sistema SET valor=?').run('invalido');
  assert.equal(configuration.isApprovalRequired(), true);
  db.prepare('DELETE FROM config_sistema').run();
  assert.equal(configuration.isApprovalRequired(), true);
  db.exec('DROP TABLE config_sistema');
  assert.equal(configuration.isApprovalRequired(), true);
});

test('somente ADMIN altera Diretoria, com valor validado e auditoria idempotente', () => {
  for (const user of [director, buyer, { id: 4, role: 'GESTAO' }]) {
    assert.throws(() => configuration.setApprovalRequired({ perfil: 'DIRETORIA', obrigatoria: '1', user }), /Somente ADMIN/);
  }
  assert.throws(() => configuration.setApprovalRequired({ perfil: 'COMPRAS', obrigatoria: '1', user: admin }), /Perfil não disponível/);
  for (const value of [undefined, '', 'true', ['0', '1']]) {
    assert.throws(() => configuration.setApprovalRequired({ perfil: 'DIRETORIA', obrigatoria: value, user: admin }), /Selecione/);
  }
  assert.equal(configuration.getHistory().length, 0);
  setMode('1');
  setMode('1');
  setMode('0');
  const history = configuration.getHistory();
  assert.equal(history.length, 2);
  assert.equal(history[0].valor_anterior, '1');
  assert.equal(history[0].valor_novo, '0');
  assert.equal(history[0].alterado_por_user_id, admin.id);
  assert.ok(history[0].alterado_em);
});

test('falha de auditoria desfaz a alteração da configuração', () => {
  db.exec(`CREATE TRIGGER fail_configuration_history BEFORE INSERT ON config_sistema_historico
    BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`);
  assert.throws(() => setMode('1'), /falha simulada/);
  assert.equal(configuration.isApprovalRequired(), false);
});

test('desligado libera compra cotada sem fabricar aprovação e mantém dados consultáveis', () => {
  assert.equal(approvals.assertPurchasePayloadMatchesApprovedItems(7, payload, ['10']), true);
  assert.equal(approvals.assertAllQuotedApprovedForPurchase(7), true);
  const summary = approvals.getSummary(7);
  assert.equal(summary.approvalRequired, false);
  assert.equal(summary.pendentesCount, 0);
  assert.equal(summary.liberadosCount, 1);
  assert.equal(summary.aprovadosCount, 0);
  assert.equal(summary.itens[0].fornecedor_nome, 'Fornecedor teste');
  assert.equal(summary.itens[0].approvalState, 'AGUARDANDO_APROVACAO');
  assert.equal(approvals.getHistory(7).length, 0);
  assert.throws(() => approvals.approveQuotedItems(7, ['10'], director), /disponíveis para consulta/);
  const released = dashboard.listDashboardStatus();
  assert.equal(released.totalItensLiberados, 1);
  assert.equal(released.totalItensAguardando, 0);
});

test('reativação exige aprovação válida e volta a bloquear mudança no preço aprovado', () => {
  setMode('1');
  assert.throws(() => approvals.assertPurchasePayloadMatchesApprovedItems(7, payload, ['10']), { code: 'ITENS_AGUARDANDO_APROVACAO' });
  assert.equal(approvals.getSummary(7).pendentesCount, 1);
  assert.equal(dashboard.listDashboardStatus().totalItensLiberados, 0);
  assert.throws(() => approvals.approveQuotedItems(7, ['10'], buyer), /Somente ADMIN ou DIRETORIA/);
  approvals.approveQuotedItems(7, ['10'], director);
  assert.equal(approvals.assertPurchasePayloadMatchesApprovedItems(7, payload, ['10']), true);
  assert.throws(() => approvals.assertPurchasePayloadMatchesApprovedItems(7, { ...payload, valor_unitario: ['11,00'] }, ['10']), { code: 'COMPRA_DIVERGE_DA_APROVACAO_ITEM' });
  assert.equal(approvals.getHistory(7).length, 1);
  setMode('0');
  assert.equal(approvals.assertPurchasePayloadMatchesApprovedItems(7, { ...payload, valor_unitario: ['11,00'] }, ['10']), true);
  assert.equal(approvals.getHistory(7).length, 1);
});

test('reativação não bloqueia novamente item comprado durante a dispensa', () => {
  db.prepare("UPDATE solicitacao_itens SET status_compra='COMPRADO'").run();
  setMode('1');
  assert.equal(approvals.assertItemsApprovedForPurchase(7, ['10']), true);
  assert.equal(approvals.assertAllQuotedApprovedForPurchase(7), true);
  assert.equal(approvals.getSummary(7).compradosCount, 1);
  assert.equal(approvals.getHistory(7).length, 0);
});

test('dispensa mantém exigência de cotação válida na conclusão integral', () => {
  db.prepare("UPDATE solicitacao_itens SET status_cotacao='PENDENTE'").run();
  assert.throws(() => approvals.assertAllQuotedApprovedForPurchase(7), { code: 'SOLICITACAO_COM_ITENS_NAO_APROVADOS' });
  assert.equal(dashboard.listDashboardStatus().totalItensLiberados, 0);
});

test('middleware reflete configuração atual em todas as formas de compra', () => {
  const req = { params: { id: '7' }, body: payload, flash() {} };
  let continued = 0;
  let redirected = 0;
  const res = { redirect() { redirected++; } };
  guard.requireApprovedPurchaseIntent(req, res, () => continued++);
  guard.requireApprovedPurchase(req, res, () => continued++);
  guard.blockExceptionalDirectPurchase({ ...req, body: { modo: 'COMPRADO' } }, res, () => continued++);
  assert.equal(continued, 3);
  setMode('1');
  guard.requireApprovedPurchaseIntent(req, res, () => continued++);
  guard.requireApprovedPurchase(req, res, () => continued++);
  guard.blockExceptionalDirectPurchase({ ...req, body: { modo: 'COMPRADO' } }, res, () => continued++);
  assert.equal(continued, 3);
  assert.equal(redirected, 3);
  guard.requireApprovedPurchaseIntent({ ...req, body: { acao: 'salvar' } }, res, () => continued++);
  assert.equal(continued, 4);
});

test('dispensa da Diretoria mantém liberação da Demanda na compra excepcional', () => {
  db.exec(`ALTER TABLE solicitacoes ADD COLUMN demanda_id INTEGER;
    CREATE TABLE demandas (id INTEGER PRIMARY KEY, liberacao_compras_status TEXT);
    INSERT INTO demandas VALUES (1,'PENDENTE');
    UPDATE solicitacoes SET demanda_id=1 WHERE id=7;`);
  let continued = false;
  let message = '';
  const req = { params: { id: '7' }, body: { modo: 'COMPRADO' }, flash(_type, value) { message = value; } };
  guard.blockExceptionalDirectPurchase(req, { redirect() {} }, () => { continued = true; });
  assert.equal(continued, false);
  assert.match(message, /Planejamento da Demanda/);
  db.prepare("UPDATE demandas SET liberacao_compras_status='LIBERADA'").run();
  guard.blockExceptionalDirectPurchase(req, { redirect() {} }, () => { continued = true; });
  assert.equal(continued, true);
});

test('rotas administrativas recusam Compras e Diretoria e permitem ao ADMIN alternar e consultar', async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const role = req.get('x-test-role');
    req.session = role ? { user: { id: 1, role } } : {};
    req.flash = () => {};
    res.render = (view, data) => res.send(ejs.render(fs.readFileSync(path.join(__dirname, '../views', `${view}.ejs`), 'utf8'), { ...data, layout() {}, fmtBR: value => value }));
    next();
  });
  app.use('/admin', adminRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/admin/configuracoes/perfis`;
  try {
    for (const role of ['COMPRAS', 'DIRETORIA', 'GESTAO']) {
      for (const method of ['GET', 'POST']) {
        const response = await fetch(url, { method, headers: { Accept: 'application/json', 'x-test-role': role }, redirect: 'manual' });
        assert.equal(response.status, 403);
      }
    }
    assert.equal(configuration.isApprovalRequired(), false);
    const anonymous = await fetch(url, { redirect: 'manual' });
    assert.equal(anonymous.status, 302);
    assert.match(anonymous.headers.get('location'), /auth\/login/);
    let response = await fetch(url, { headers: { 'x-test-role': 'ADMIN' } });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Ativar acompanhamento da Diretoria/);
    response = await fetch(url, { method: 'POST', headers: { 'x-test-role': 'ADMIN', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'perfil=DIRETORIA&obrigatoria=1', redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(configuration.isApprovalRequired(), true);
    response = await fetch(url, { headers: { 'x-test-role': 'ADMIN' } });
    assert.match(await response.text(), /Desativar acompanhamento da Diretoria/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
