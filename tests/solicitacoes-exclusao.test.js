const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-solicitacoes-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.DATA_DIR = tempDir;
process.env.SQLITE_DIR = tempDir;

const db = require('../database/db');

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    role TEXT,
    ativo INTEGER DEFAULT 1
  );

  CREATE TABLE solicitacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT,
    solicitante_user_id INTEGER,
    setor_origem TEXT,
    prioridade TEXT,
    titulo TEXT,
    descricao TEXT,
    status TEXT,
    os_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE solicitacao_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitacao_id INTEGER NOT NULL,
    item_nome TEXT,
    item_descricao TEXT,
    unidade TEXT DEFAULT 'UN',
    qtd_solicitada REAL DEFAULT 0,
    qtd_recebida_total REAL DEFAULT 0,
    status_item TEXT DEFAULT 'PENDENTE',
    FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE
  );

  CREATE TABLE solicitacao_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitacao_id INTEGER NOT NULL,
    user_id INTEGER,
    status_anterior TEXT,
    status_novo TEXT,
    acao TEXT NOT NULL,
    observacao TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    origem_tipo TEXT NOT NULL,
    origem_id INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    status_referencia TEXT,
    lida INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

db.prepare("INSERT INTO users (id, name, role) VALUES (1, 'Admin', 'ADMIN')").run();

const service = require('../modules/solicitacoes/solicitacoes.service');

test.after(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_error) {}
});

function criarSolicitacao({ status = 'ABERTA', osId = null } = {}) {
  const info = db.prepare(`
    INSERT INTO solicitacoes (numero, solicitante_user_id, setor_origem, prioridade, titulo, status, os_id)
    VALUES (?, 1, 'Manutenção', 'MEDIA', 'Teste', ?, ?)
  `).run(`SOL-TEST-${Date.now()}-${Math.random()}`, status, osId);
  db.prepare(`
    INSERT INTO solicitacao_itens (solicitacao_id, item_nome, item_descricao, unidade, qtd_solicitada)
    VALUES (?, 'Rolamento', 'Rolamento teste', 'UN', 2)
  `).run(info.lastInsertRowid);
  db.prepare(`
    INSERT INTO notificacoes (user_id, origem_tipo, origem_id, titulo, mensagem)
    VALUES (1, 'SOLICITACAO', ?, 'Solicitação', 'Criada')
  `).run(info.lastInsertRowid);
  return Number(info.lastInsertRowid);
}

test('exclui fisicamente solicitação aberta sem movimentação e seus filhos descartáveis', () => {
  const id = criarSolicitacao();

  const resultado = service.excluirSolicitacao(id, 1);

  assert.equal(resultado.modo, 'excluida');
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM solicitacoes WHERE id=?').get(id).total, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM solicitacao_itens WHERE solicitacao_id=?').get(id).total, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM notificacoes WHERE origem_id=?').get(id).total, 0);
});

test('bloqueia exclusão física quando há vínculo com OS sem cancelar parcialmente', () => {
  const id = criarSolicitacao({ osId: 269 });

  assert.throws(
    () => service.excluirSolicitacao(id, 1),
    /vinculada a uma OS e possui rastreabilidade/
  );

  const row = db.prepare('SELECT status, os_id FROM solicitacoes WHERE id=?').get(id);
  assert.equal(row.status, 'ABERTA');
  assert.equal(row.os_id, 269);
});

test('cancelamento é operação separada e preserva registro com log', () => {
  const id = criarSolicitacao({ osId: 269 });

  const resultado = service.cancelarSolicitacao(id, 1);

  assert.equal(resultado.modo, 'cancelada');
  assert.equal(db.prepare('SELECT status FROM solicitacoes WHERE id=?').get(id).status, 'CANCELADA');
  const log = db.prepare('SELECT status_anterior, status_novo, acao FROM solicitacao_logs WHERE solicitacao_id=? ORDER BY id DESC LIMIT 1').get(id);
  assert.equal(log.status_anterior, 'ABERTA');
  assert.equal(log.status_novo, 'CANCELADA');
  assert.equal(log.acao, 'CANCELAR_SOLICITACAO');
});
