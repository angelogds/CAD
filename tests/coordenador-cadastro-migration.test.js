const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const migrate = require('../database/migrations/216_users_funcao_identity');
const { deriveUserFunctionSector } = require('../modules/usuarios/usuarios.perfil');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      email TEXT UNIQUE, password_hash TEXT, photo_path TEXT, telefone_whatsapp TEXT,
      created_at TEXT, ativo INTEGER DEFAULT 1, deleted_at TEXT,
      role TEXT NOT NULL CHECK (role IN ('ADMIN','MECANICO','COORDENADOR_RECICLAGEM')),
      funcao TEXT NOT NULL DEFAULT 'AUXILIAR' CHECK (funcao IN ('MECANICO','MONTADOR','AUXILIAR')),
      setor TEXT, qr_token TEXT
    );
    CREATE UNIQUE INDEX idx_users_qr ON users(qr_token) WHERE qr_token IS NOT NULL;
    CREATE TABLE audit (user_id INTEGER);
    CREATE TRIGGER users_insert AFTER INSERT ON users BEGIN INSERT INTO audit VALUES(NEW.id); END;
    CREATE TABLE history (user_id INTEGER REFERENCES users(id));
    INSERT INTO users(id,name,email,role,funcao,qr_token) VALUES (1,'Original','original@test','MECANICO','MECANICO','qr');
    INSERT INTO history VALUES(1);
    INSERT INTO users(id,name,role) VALUES (50,'Removido','ADMIN');
    DELETE FROM users WHERE id=50;
    CREATE VIEW user_names AS SELECT name FROM users;
  `);
  return db;
}
const run = (db) => migrate({ db, tableExists: (name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) });

test('migração corrige CHECK legado, preserva dados, vínculos, índices, triggers e sequência', () => {
  const db = fixture();
  try {
    assert.throws(() => db.prepare('INSERT INTO users(name,role,funcao) VALUES (?,?,?)').run('Teste','COORDENADOR_RECICLAGEM','Coordenador da Reciclagem'), /CHECK/);
    const original = db.prepare('SELECT * FROM users').all();
    run(db);
    run(db);
    assert.deepEqual(db.prepare('SELECT * FROM users').all(), original);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA legacy_alter_table').get().legacy_alter_table, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT name FROM user_names').get().name, 'Original');
    assert.equal(db.prepare('SELECT user_id FROM history').get().user_id, 1);
    const identity = deriveUserFunctionSector('COORDENADOR_RECICLAGEM');
    const inserted = db.prepare('INSERT INTO users(name,email,role,funcao,setor) VALUES (?,?,?,?,?)').run('Coordenador','coord@test','COORDENADOR_RECICLAGEM',identity.funcao,identity.setor);
    assert.equal(Number(inserted.lastInsertRowid), 51);
    assert.equal(db.prepare('SELECT user_id FROM audit ORDER BY rowid DESC').get().user_id, 51);
    assert.throws(() => db.prepare("INSERT INTO users(name,role,qr_token) VALUES ('Duplicado','ADMIN','qr')").run(), /UNIQUE/);
    assert.throws(() => db.prepare("INSERT INTO users(name,role) VALUES ('Inválido','INVALID')").run(), /CHECK/);
    db.prepare('UPDATE users SET funcao=?, setor=? WHERE id=51').run(identity.funcao,identity.setor);
    db.prepare("INSERT INTO users(name,role,funcao) VALUES ('Admin','ADMIN',NULL)").run();
  } finally { db.close(); }
});

test('falha de integridade reverte a migração inteira e restaura pragmas', () => {
  const db = fixture();
  try {
    db.exec('PRAGMA foreign_keys=OFF; INSERT INTO history VALUES(999); PRAGMA foreign_keys=ON;');
    const before = db.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get().sql;
    assert.throws(() => run(db), /integridade/);
    assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get().sql, before);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='users_funcao_identity_tmp'").get().n, 0);
  } finally { db.close(); }
});

test('cadastro e edição reais do coordenador funcionam depois da migração', () => {
  const db = fixture();
  const dbPath = require.resolve('../database/db');
  const servicePath = require.resolve('../modules/usuarios/usuarios.service');
  const previous = require.cache[dbPath];
  try {
    run(db);
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
    delete require.cache[servicePath];
    const service = require(servicePath);
    service.create({name:'Coordenador',email:'coord@test',role:'COORDENADOR_RECICLAGEM',password:'Test-only-123'});
    const user = db.prepare("SELECT * FROM users WHERE email='coord@test'").get();
    assert.equal(user.funcao, 'Coordenador da Reciclagem');
    assert.equal(user.setor, 'RECICLAGEM');
    service.update(user.id, {name:'Coordenador Editado',email:'coord@test',role:user.role});
    assert.equal(db.prepare('SELECT name FROM users WHERE id=?').get(user.id).name,'Coordenador Editado');
  } finally {
    delete require.cache[servicePath];
    if (previous) require.cache[dbPath] = previous; else delete require.cache[dbPath];
    db.close();
  }
});
