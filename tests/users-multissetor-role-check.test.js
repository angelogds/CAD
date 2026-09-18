const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const migrate = require('../database/migrations/200_users_add_multissetor_roles');

function tableExists(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function makeLegacyDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (
        role IN (
          'INSPECAO_QUALIDADE',
          'ADMIN','DIRECAO','DIRETORIA','RH','COMPRAS',
          'ENCARREGADO_PRODUCAO','PRODUCAO','MECANICO',
          'ALMOXARIFE','ALMOXARIFADO','MANUTENCAO','MANUTENCAO_SUPERVISOR'
        )
      ),
      photo_path TEXT,
      telefone_whatsapp TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_users_role_manual ON users(role);
    CREATE TABLE os_fake (
      id INTEGER PRIMARY KEY,
      opened_by INTEGER REFERENCES users(id)
    );
    INSERT INTO users (name,email,password_hash,role,telefone_whatsapp)
    VALUES ('Admin Teste','admin@teste.local','hash','ADMIN','5575999999999');
  `);
  return db;
}

test('migration 200 preserva usuários e libera os perfis multissetoriais', () => {
  const db = makeLegacyDb();

  migrate({ db, tableExists: (name) => tableExists(db, name) });

  const admin = db.prepare('SELECT * FROM users WHERE email=?').get('admin@teste.local');
  assert.equal(admin.name, 'Admin Teste');
  assert.equal(admin.role, 'ADMIN');
  assert.equal(admin.telefone_whatsapp, '5575999999999');

  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
    .run('Logística', 'logistica@teste.local', 'hash', 'ENCARREGADO_LOGISTICA');

  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
    .run('Frigorífico', 'frigorifico@teste.local', 'hash', 'ENCARREGADO_FRIGORIFICO');

  assert.equal(
    db.prepare("SELECT role FROM users WHERE email='logistica@teste.local'").get().role,
    'ENCARREGADO_LOGISTICA'
  );
  assert.equal(
    db.prepare("SELECT role FROM users WHERE email='frigorifico@teste.local'").get().role,
    'ENCARREGADO_FRIGORIFICO'
  );

  const index = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_role_manual'").get();
  assert.equal(index.name, 'idx_users_role_manual');

  const fk = db.prepare('PRAGMA foreign_key_check').all();
  assert.deepEqual(fk, []);

  assert.throws(
    () => db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
      .run('Inválido', 'invalido@teste.local', 'hash', 'ROLE_INEXISTENTE'),
    /CHECK constraint failed/
  );

  db.close();
});

test('migration 200 é idempotente quando os dois perfis já existem', () => {
  const db = makeLegacyDb();
  migrate({ db, tableExists: (name) => tableExists(db, name) });
  migrate({ db, tableExists: (name) => tableExists(db, name) });

  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get().sql;
  assert.match(sql, /ENCARREGADO_LOGISTICA/);
  assert.match(sql, /ENCARREGADO_FRIGORIFICO/);
  assert.equal((sql.match(/ENCARREGADO_LOGISTICA/g) || []).length, 1);
  assert.equal((sql.match(/ENCARREGADO_FRIGORIFICO/g) || []).length, 1);

  db.close();
});
