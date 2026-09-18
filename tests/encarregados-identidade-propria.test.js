const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = require('../database/migrations/202_users_identidade_encarregados');
const {
  getRoleProfile,
  isDirectUserIdentityRole,
  deriveUserFunctionSector,
} = require('../modules/usuarios/usuarios.perfil');

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
          'ADMIN','DIRETORIA','RH','COMPRAS',
          'MECANICO','MANUTENCAO_SUPERVISOR',
          'ENCARREGADO_LOGISTICA','ENCARREGADO_FRIGORIFICO'
        )
      ),
      photo_path TEXT,
      telefone_whatsapp TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ativo INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT
    );

    CREATE INDEX idx_users_role_identity_test ON users(role);

    CREATE TABLE estoque_movimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      item_id INTEGER,
      quantidade REAL,
      retirado_por_colaborador_id INTEGER,
      entregue_por_user_id INTEGER REFERENCES users(id)
    );

    INSERT INTO users (name,email,password_hash,role)
    VALUES ('Logística Teste','logistica@teste.local','hash','ENCARREGADO_LOGISTICA');
  `);

  return db;
}

test('perfil do encarregado é a própria identidade do usuário', () => {
  assert.equal(isDirectUserIdentityRole('ENCARREGADO_MANUTENCAO'), true);
  assert.equal(isDirectUserIdentityRole('MANUTENCAO_SUPERVISOR'), true);
  assert.equal(isDirectUserIdentityRole('ENCARREGADO_LOGISTICA'), true);
  assert.equal(isDirectUserIdentityRole('ENCARREGADO_FRIGORIFICO'), true);
  assert.equal(isDirectUserIdentityRole('RH'), true);
  assert.equal(isDirectUserIdentityRole('MECANICO'), false);

  assert.deepEqual(
    deriveUserFunctionSector('ENCARREGADO_LOGISTICA'),
    { funcao: 'Encarregado de Logística', setor: 'LOGÍSTICA' }
  );
  assert.deepEqual(
    deriveUserFunctionSector('ENCARREGADO_FRIGORIFICO'),
    { funcao: 'Encarregado do Frigorífico', setor: 'FRIGORÍFICO' }
  );
  assert.equal(getRoleProfile('ENCARREGADO_MANUTENCAO').setor, 'RECICLAGEM');
});

test('migration 202 libera encarregado de manutenção e cria identidade direta sem perder dados', () => {
  const db = makeLegacyDb();

  migration({
    db,
    tableExists: (name) => tableExists(db, name),
    addColumnIfMissing: (table, column, ddl) => addColumnIfMissing(db, table, column, ddl),
  });

  assert.equal(columnExists(db, 'users', 'funcao'), true);
  assert.equal(columnExists(db, 'users', 'setor'), true);
  assert.equal(columnExists(db, 'users', 'qr_token'), true);
  assert.equal(columnExists(db, 'users', 'qr_ativo'), true);
  assert.equal(columnExists(db, 'estoque_movimentos', 'retirado_por_user_id'), true);

  const logistica = db.prepare("SELECT name,role,funcao,setor FROM users WHERE email='logistica@teste.local'").get();
  assert.equal(logistica.name, 'Logística Teste');
  assert.equal(logistica.role, 'ENCARREGADO_LOGISTICA');
  assert.equal(logistica.funcao, 'Encarregado de Logística');
  assert.equal(logistica.setor, 'LOGÍSTICA');

  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
    .run('Manutenção Teste', 'manutencao@teste.local', 'hash', 'ENCARREGADO_MANUTENCAO');

  assert.equal(
    db.prepare("SELECT role FROM users WHERE email='manutencao@teste.local'").get().role,
    'ENCARREGADO_MANUTENCAO'
  );

  const index = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_role_identity_test'").get();
  assert.equal(index.name, 'idx_users_role_identity_test');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

  migration({
    db,
    tableExists: (name) => tableExists(db, name),
    addColumnIfMissing: (table, column, ddl) => addColumnIfMissing(db, table, column, ddl),
  });

  assert.equal(db.prepare("SELECT COUNT(*) total FROM users").get().total, 2);
  db.close();
});

test('Meu Portal não tenta vincular perfis encarregados a colaboradores', () => {
  const vinculo = read('modules/meu-portal/meu-portal.vinculo.js');
  const service = read('modules/meu-portal/meu-portal.service.js');

  assert.match(vinculo, /isDirectUserIdentityRole\(user\.role\)/);
  assert.match(vinculo, /status:\s*'DIRECT_USER'/);
  assert.match(vinculo, /if \(directUserIdentity\)/);
  assert.match(vinculo, /if \(isDirectUserIdentityRole\(user\.role\)\) return next\(\)/);

  assert.match(service, /directUserIdentity:\s*true/);
  assert.match(service, /Este perfil usa o próprio cadastro de usuário como identidade/);
  assert.match(service, /retirado_por_user_id/);
  assert.match(service, /legacyLinked/);
});

test('Almoxarifado mantém QR de mecânico e adiciona QR próprio do encarregado', () => {
  const estoque = read('modules/estoque/estoque.reservas.service.js');
  const userQr = read('modules/usuarios/usuarios.qr.service.js');
  const scanner = read('views/almoxarifado/retirada_qr.ejs');

  assert.match(userQr, /CGUSR:/);
  assert.match(userQr, /isDirectUserIdentityRole/);
  assert.match(estoque, /function getPessoaByQr/);
  assert.match(estoque, /identity_type:\s*'USUARIO'/);
  assert.match(estoque, /identity_type:\s*'COLABORADOR'/);
  assert.match(estoque, /retirado_por_user_id:/);
  assert.match(estoque, /retirado_por_colaborador_id:/);
  assert.match(estoque, /QR_USUARIO/);
  assert.match(estoque, /QR_COLABORADOR/);
  assert.match(scanner, /RESPONSÁVEL IDENTIFICADO/);
});

test('cadastro de usuários deriva função e setor do perfil', () => {
  const usersService = read('modules/usuarios/usuarios.service.js');
  const usersController = read('modules/usuarios/usuarios.controller.js');
  const novo = read('views/usuarios/novo.ejs');
  const editar = read('views/usuarios/edit.ejs');

  assert.match(usersService, /ENCARREGADO_MANUTENCAO/);
  assert.match(usersService, /deriveUserFunctionSector/);
  assert.match(usersService, /isDirectUserIdentityRole\(role\)/);
  assert.match(usersController, /Encarregado de Manutenção/);
  assert.match(usersController, /ROLES_WITH_CONTEXT/);
  assert.match(novo, /id="roleFunction"/);
  assert.match(novo, /id="roleSector"/);
  assert.match(editar, /Derivada automaticamente do perfil/);
  assert.match(editar, /O perfil é a própria identidade do encarregado/);
});
