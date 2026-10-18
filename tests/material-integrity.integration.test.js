const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const db = new Database(':memory:');
require.cache[require.resolve('../database/db')] = { exports: db };
require.cache[require.resolve('../modules/os-chat/os-chat.service')] = { exports: { registrarMensagemSistema() {} } };
db.exec(`
  CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY,numero TEXT,titulo TEXT,status TEXT,os_id INTEGER,equipamento_id INTEGER,setor_origem TEXT,solicitante_user_id INTEGER,updated_at TEXT,recebida_em TEXT);
  CREATE TABLE solicitacao_itens(id INTEGER PRIMARY KEY,solicitacao_id INTEGER,item_nome TEXT,unidade TEXT,estoque_item_id INTEGER,qtd_comprada REAL,qtd_solicitada REAL,qtd_recebida_total REAL,status_compra TEXT);
  CREATE TABLE estoque_itens(id INTEGER PRIMARY KEY,nome TEXT,unidade TEXT,saldo_atual REAL,updated_at TEXT);
  CREATE TABLE os(id INTEGER PRIMARY KEY,status TEXT,equipamento_id INTEGER);
  CREATE TABLE equipamentos(id INTEGER PRIMARY KEY,nome TEXT);
  CREATE TABLE colaboradores(id INTEGER PRIMARY KEY,nome TEXT,apelido TEXT,funcao TEXT,setor TEXT,status TEXT,foto_url TEXT,user_id INTEGER,deleted_at TEXT);
  CREATE TABLE estoque_movimentos(id INTEGER PRIMARY KEY,tipo TEXT,item_id INTEGER,quantidade REAL,solicitacao_item_id INTEGER,created_at TEXT);
  CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,role TEXT);
`);
const tableExists = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
require('../database/migrations/180_almox_estoque_reservas_qr_colaboradores')({
  db, tableExists,
  addColumnIfMissing(table, column, ddl) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  },
});
const solicitacoes = require('../modules/solicitacoes/solicitacoes.service');
const reservas = require('../modules/estoque/estoque.reservas.service');
const estoque = require('../modules/estoque/estoque.service');
const almox = require('../modules/almoxarifado/almoxarifado.service');
const retirar = quantidade => reservas.retirarReserva({reservaId:1,quantidade,pessoaTipo:'COLABORADOR',pessoaId:1,nomeRetirante:'Pessoa Teste',entreguePorUserId:1});
function state() {
  return {
    saldo: db.prepare('SELECT saldo_atual n FROM estoque_itens WHERE id=1').get().n,
    reserva: db.prepare('SELECT quantidade_retirada,status FROM estoque_reservas WHERE id=1').get(),
    movimentos: db.prepare('SELECT COUNT(*) n FROM estoque_movimentos').get().n,
    status: db.prepare('SELECT status FROM solicitacoes WHERE id=1').get().status,
  };
}
beforeEach(() => {
  db.exec(`DROP TRIGGER IF EXISTS fail_status;
    DELETE FROM estoque_movimentos; DELETE FROM estoque_reservas; DELETE FROM solicitacao_itens;
    DELETE FROM solicitacoes; DELETE FROM estoque_itens; DELETE FROM os; DELETE FROM equipamentos; DELETE FROM colaboradores; DELETE FROM users;
    INSERT INTO users(id,name,role) VALUES(1,'Admin teste','ADMIN');
    INSERT INTO os VALUES(1,'ABERTA',1); INSERT INTO equipamentos VALUES(1,'Equipamento teste');
    INSERT INTO colaboradores(id,nome,funcao,setor,status) VALUES(1,'Pessoa Teste','MECANICO','MANUTENCAO','ATIVO');
    INSERT INTO estoque_itens VALUES(1,'Material teste','UN',10,NULL);
    INSERT INTO solicitacoes VALUES(1,'S1','Teste','SEPARADA_PARA_RETIRADA',1,1,'RECICLAGEM',1,NULL,NULL);
    INSERT INTO solicitacao_itens VALUES(1,1,'Material A','UN',1,5,5,5,'COMPRADO');
    INSERT INTO estoque_reservas(id,solicitacao_id,solicitacao_item_id,estoque_item_id,os_id,equipamento_id,quantidade_reservada,quantidade_retirada,status)
      VALUES(1,1,1,1,1,1,5,0,'RESERVADA');
  `);
});
after(() => db.close());

test('cancelar libera o restante reservado e preserva retiradas históricas', () => {
  retirar(2);
  solicitacoes.cancelarSolicitacao(1,1);
  assert.equal(reservas.resumoPorItem().get(1) || 0,0);
  assert.equal(state().saldo,8);
  assert.equal(state().reserva.quantidade_retirada,2);
  assert.equal(state().movimentos,1);
  assert.throws(() => retirar(1));
});

test('retirada recusa solicitação cancelada legada e OS encerrada sem baixar saldo', () => {
  const initial = state();
  db.exec("UPDATE solicitacoes SET status='CANCELADA' WHERE id=1");
  assert.throws(() => retirar(1));
  assert.equal(reservas.resumoPorItem().get(1) || 0,0);
  assert.equal(state().saldo,initial.saldo);
  db.exec("UPDATE solicitacoes SET status='SEPARADA_PARA_RETIRADA' WHERE id=1; UPDATE os SET status='FECHADA' WHERE id=1");
  assert.throws(() => retirar(1));
  assert.equal(state().movimentos,0);
});

test('erro na sincronização reverte reserva, movimento e saldo na retirada QR', () => {
  const initial = state();
  db.exec("CREATE TRIGGER fail_status BEFORE UPDATE OF status ON solicitacoes BEGIN SELECT RAISE(ABORT,'falha controlada'); END");
  assert.throws(() => retirar(5), /falha controlada/);
  assert.deepEqual(state(),initial);
});

test('finalização de pedido misto não encerra a cotação dos itens restantes', () => {
  db.exec("UPDATE solicitacoes SET status='EM_COTACAO' WHERE id=1; INSERT INTO solicitacao_itens VALUES(2,1,'Material B','UN',NULL,0,3,0,'PENDENTE')");
  assert.throws(() => almox.finalizarRecebimento(1));
  assert.equal(state().status,'EM_COTACAO');
});

test('finalização e sincronização do recebimento são atômicas', () => {
  db.exec("UPDATE solicitacoes SET status='EM_RECEBIMENTO' WHERE id=1; CREATE TRIGGER fail_status BEFORE UPDATE OF status ON solicitacoes WHEN NEW.status='SEPARADA_PARA_RETIRADA' BEGIN SELECT RAISE(ABORT,'falha controlada'); END");
  assert.throws(() => almox.finalizarRecebimento(1), /falha controlada/);
  assert.equal(state().status,'EM_RECEBIMENTO');
});

test('fluxo válido recebe, retira e não duplica a baixa no reenvio', () => {
  db.exec("UPDATE solicitacoes SET status='EM_RECEBIMENTO' WHERE id=1");
  assert.equal(almox.finalizarRecebimento(1),'SEPARADA_PARA_RETIRADA');
  retirar(5);
  assert.equal(state().status,'ENTREGUE_SOLICITANTE');
  assert.equal(state().saldo,5);
  assert.throws(() => retirar(5));
  assert.equal(state().movimentos,1);
});

for (const [name, execute] of [
  ['contextual', () => estoque.registrarSaida({item_id:1,quantidade:5,solicitacao_id:1,solicitacao_item_id:1,usuario_id:1})],
  ['em lote', () => estoque.registrarSaidasSolicitacao({solicitacao_id:1,usuario_id:1})],
]) {
  test(`retirada ${name} reverte todos os efeitos quando a sincronização falha`, () => {
    const initial = state();
    db.exec("CREATE TRIGGER fail_status BEFORE UPDATE OF status ON solicitacoes BEGIN SELECT RAISE(ABORT,'falha controlada'); END");
    assert.throws(execute, /falha controlada/);
    assert.deepEqual(state(), initial);
  });
  test(`retirada ${name} respeita cancelamento e conclui um fluxo válido`, () => {
    db.exec("UPDATE solicitacoes SET status='CANCELADA' WHERE id=1");
    assert.throws(execute, /encerrada|cancelada/i);
    assert.equal(state().movimentos, 0);
    db.exec("UPDATE solicitacoes SET status='SEPARADA_PARA_RETIRADA' WHERE id=1");
    execute();
    assert.equal(state().saldo, 5);
    assert.equal(state().status, 'ENTREGUE_SOLICITANTE');
    assert.equal(state().movimentos, 1);
  });
}
