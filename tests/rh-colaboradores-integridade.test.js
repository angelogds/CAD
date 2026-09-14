const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const migration = require('../database/migrations/196_rh_colaboradores_integridade');

function setupDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE colaboradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      user_id INTEGER,
      ativo INTEGER NOT NULL DEFAULT 1,
      status TEXT DEFAULT 'ATIVO',
      deleted_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE escala_alocacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id)
    );
  `);
  const tableExists = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  const columnExists = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  return { db, tableExists, columnExists };
}

test('migration auto-inativa apenas duplicado fantasma sem referências', () => {
  const ctx = setupDb();
  ctx.db.prepare('INSERT INTO colaboradores (nome) VALUES (?)').run('Júnior');
  ctx.db.prepare('INSERT INTO colaboradores (nome) VALUES (?)').run('Junior');

  migration(ctx);

  const rows = ctx.db.prepare('SELECT id, nome, ativo, status, deleted_at FROM colaboradores ORDER BY id').all();
  assert.equal(rows[0].ativo, 1);
  assert.equal(rows[1].ativo, 0);
  assert.equal(rows[1].status, 'INATIVO');
  assert.ok(rows[1].deleted_at);

  const alert = ctx.db.prepare('SELECT status FROM colaboradores_integridade_alertas').get();
  assert.equal(alert.status, 'AUTO_INATIVADO');
  ctx.db.close();
});

test('migration preserva duplicidades com histórico para revisão', () => {
  const ctx = setupDb();
  const a = Number(ctx.db.prepare('INSERT INTO colaboradores (nome) VALUES (?)').run('João Silva').lastInsertRowid);
  const b = Number(ctx.db.prepare('INSERT INTO colaboradores (nome) VALUES (?)').run('JOAO SILVA').lastInsertRowid);
  ctx.db.prepare('INSERT INTO escala_alocacoes (colaborador_id) VALUES (?)').run(a);
  ctx.db.prepare('INSERT INTO escala_alocacoes (colaborador_id) VALUES (?)').run(b);

  migration(ctx);

  const active = ctx.db.prepare('SELECT COUNT(*) total FROM colaboradores WHERE ativo=1 AND deleted_at IS NULL').get().total;
  assert.equal(active, 2);
  const alert = ctx.db.prepare("SELECT status FROM colaboradores_integridade_alertas WHERE status='PENDENTE_REVISAO'").get();
  assert.ok(alert);
  ctx.db.close();
});

test('indice impede novo colaborador ativo com nome equivalente por acento', () => {
  const ctx = setupDb();
  ctx.db.prepare('INSERT INTO colaboradores (nome) VALUES (?)').run('Júnior');
  migration(ctx);

  assert.throws(
    () => ctx.db.prepare('INSERT INTO colaboradores (nome) VALUES (?)').run('Junior'),
    /UNIQUE constraint failed: colaboradores\.nome_integridade/
  );

  assert.doesNotThrow(() => {
    ctx.db.prepare("INSERT INTO colaboradores (nome, ativo, status) VALUES (?, 0, 'INATIVO')").run('Junior');
  });
  ctx.db.close();
});

test('server monta cadastro mestre e Meu Portal', () => {
  const server = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /mount\("\/colaboradores",\s*"\.\/modules\/colaboradores\/colaboradores\.routes"\)/);
  assert.match(server, /mount\("\/meu-portal",\s*"\.\/modules\/meu-portal\/meu-portal\.routes"\)/);
});
