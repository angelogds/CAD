const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const migration = require("../database/migrations/155_users_add_inspecao_qualidade_role");

const dbPath = path.join(os.tmpdir(), `cad-inspecao-qualidade-${process.pid}-${Date.now()}.sqlite`);
const sqlite = new DatabaseSync(dbPath);
const db = {
  exec(sql) { return sqlite.exec(sql); },
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    return {
      run: (...args) => statement.run(...args),
      get: (...args) => statement.get(...args),
      all: (...args) => statement.all(...args),
    };
  },
};
const tableExists = (name) => !!db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
  .get(name);

try {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN','MECANICO')),
      photo_path TEXT,
      telefone_whatsapp TEXT,
      funcao TEXT NOT NULL DEFAULT 'AUXILIAR',
      ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_users_name ON users(name);
    CREATE TABLE user_audit (user_id INTEGER, action TEXT);
    CREATE TRIGGER trg_users_insert AFTER INSERT ON users BEGIN
      INSERT INTO user_audit(user_id, action) VALUES (NEW.id, 'INSERT');
    END;
    CREATE TABLE os (id INTEGER PRIMARY KEY, opened_by INTEGER REFERENCES users(id));
    INSERT INTO users (name,email,password_hash,role,photo_path,telefone_whatsapp,funcao,ativo)
    VALUES ('Existente','existente@example.com','hash','ADMIN','/foto.jpg','5599999999999','MECANICO',1);
    INSERT INTO os (id, opened_by) VALUES (10, 1);
  `);

  migration({ db, tableExists });

  const columns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  assert.deepEqual(columns, [
    "id", "name", "email", "password_hash", "role", "photo_path",
    "telefone_whatsapp", "funcao", "ativo", "created_at",
  ]);
  assert.deepEqual(
    { ...db.prepare("SELECT telefone_whatsapp, funcao, ativo FROM users WHERE id = 1").get() },
    { telefone_whatsapp: "5599999999999", funcao: "MECANICO", ativo: 1 },
  );
  assert.match(
    db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().sql,
    /'INSPECAO_QUALIDADE'/,
  );
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_name'").get());
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_users_insert'").get());

  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
    .run("Qualidade", "qualidade@example.com", "hash", "INSPECAO_QUALIDADE");
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM user_audit WHERE action = 'INSERT'").get().total, 2);
  console.log("Migration 155 validada com preservação de dados, colunas, índice, trigger e FK.");
} finally {
  sqlite.close();
  fs.rmSync(dbPath, { force: true });
}
