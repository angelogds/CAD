const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const migration = require("../database/migrations/201_users_arquivamento.js");
const {
  removeOrArchiveUser,
  restoreUser,
} = require("../modules/usuarios/usuarios-lifecycle");

function tableExists(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columnExists(db, table, column) {
  if (!tableExists(db, table)) return false;
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumnIfMissing(db, table, column, ddl) {
  if (!columnExists(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function makeDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    );

    CREATE TABLE users_old (
      id INTEGER PRIMARY KEY
    );

    CREATE TRIGGER trg_users_ai_users_old
    AFTER INSERT ON users
    BEGIN
      INSERT OR IGNORE INTO users_old (id) VALUES (NEW.id);
    END;

    CREATE TRIGGER trg_users_ad_users_old
    AFTER DELETE ON users
    BEGIN
      DELETE FROM users_old WHERE id = OLD.id;
    END;

    CREATE TABLE legacy_history (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users_old(id)
    );

    CREATE TABLE current_history (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id)
    );
  `);

  migration({
    db,
    tableExists: (name) => tableExists(db, name),
    addColumnIfMissing: (table, column, ddl) => addColumnIfMissing(db, table, column, ddl),
  });

  return db;
}

test("migration 201 adiciona arquivamento sem perder usuários", () => {
  const db = makeDb();
  db.prepare("INSERT INTO users (name,email) VALUES (?,?)").run("Usuário", "u@teste.local");

  assert.equal(columnExists(db, "users", "ativo"), true);
  assert.equal(columnExists(db, "users", "deleted_at"), true);
  assert.equal(db.prepare("SELECT ativo FROM users WHERE email=?").get("u@teste.local").ativo, 1);

  migration({
    db,
    tableExists: (name) => tableExists(db, name),
    addColumnIfMissing: (table, column, ddl) => addColumnIfMissing(db, table, column, ddl),
  });

  assert.equal(db.prepare("SELECT COUNT(*) total FROM users").get().total, 1);
  db.close();
});

test("usuário com FK direta em users é arquivado em vez de quebrar exclusão", () => {
  const db = makeDb();
  const id = Number(db.prepare("INSERT INTO users (name,email) VALUES (?,?)").run("Com histórico", "hist@teste.local").lastInsertRowid);
  db.prepare("INSERT INTO current_history (id,user_id) VALUES (?,?)").run(1, id);

  const result = removeOrArchiveUser(db, id, 999);
  assert.equal(result.action, "archived");

  const user = db.prepare("SELECT ativo, deleted_at FROM users WHERE id=?").get(id);
  assert.equal(user.ativo, 0);
  assert.ok(user.deleted_at);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  db.close();
});

test("FK legada em users_old também faz fallback para arquivamento", () => {
  const db = makeDb();
  const id = Number(db.prepare("INSERT INTO users (name,email) VALUES (?,?)").run("Legado", "legado@teste.local").lastInsertRowid);
  db.prepare("INSERT INTO legacy_history (id,user_id) VALUES (?,?)").run(1, id);

  const result = removeOrArchiveUser(db, id, 999);
  assert.equal(result.action, "archived");
  assert.equal(db.prepare("SELECT ativo FROM users WHERE id=?").get(id).ativo, 0);
  assert.equal(db.prepare("SELECT id FROM users_old WHERE id=?").get(id).id, id);
  db.close();
});

test("usuário sem histórico é apagado fisicamente e usuário arquivado pode ser restaurado", () => {
  const db = makeDb();

  const freeId = Number(db.prepare("INSERT INTO users (name,email) VALUES (?,?)").run("Livre", "livre@teste.local").lastInsertRowid);
  assert.equal(removeOrArchiveUser(db, freeId, 999).action, "deleted");
  assert.equal(db.prepare("SELECT id FROM users WHERE id=?").get(freeId), undefined);

  const archivedId = Number(db.prepare("INSERT INTO users (name,email) VALUES (?,?)").run("Arquivado", "arq@teste.local").lastInsertRowid);
  db.prepare("INSERT INTO current_history (id,user_id) VALUES (?,?)").run(2, archivedId);
  assert.equal(removeOrArchiveUser(db, archivedId, 999).action, "archived");
  assert.equal(restoreUser(db, archivedId).action, "restored");

  const restored = db.prepare("SELECT ativo, deleted_at FROM users WHERE id=?").get(archivedId);
  assert.equal(restored.ativo, 1);
  assert.equal(restored.deleted_at, null);

  assert.throws(() => removeOrArchiveUser(db, archivedId, archivedId), /próprio usuário/);
  db.close();
});
