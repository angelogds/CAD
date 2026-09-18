const { deriveUserFunctionSector } = require('../../modules/usuarios/usuarios.perfil');

const REQUIRED_ROLES = ['ENCARREGADO_MANUTENCAO'];
const TEMP_TABLE = 'users_identity_roles_tmp';

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function ensureRoleCheck(db) {
  const usersTable = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  const createUsersSql = String(usersTable?.sql || '');
  if (!createUsersSql) throw new Error('Não foi possível identificar o schema da tabela users.');

  const missingRoles = REQUIRED_ROLES.filter((role) => !createUsersSql.includes(`'${role}'`));
  if (!missingRoles.length) return;

  const roleCheckPattern = /(role\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*role\s+IN\s*\()/i;
  if (!roleCheckPattern.test(createUsersSql)) {
    throw new Error('CHECK de role não encontrado na tabela users.');
  }

  const columns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  const dependentObjects = db.prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE tbl_name='users' AND type IN ('index','trigger') AND sql IS NOT NULL"
  ).all();

  const quotedColumns = columns.map(quoteIdentifier).join(', ');
  const insertion = `${missingRoles.map((role) => `'${role}'`).join(', ')}, `;
  const createTempSql = createUsersSql
    .replace(
      /^(\s*CREATE\s+TABLE\s+)(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\[]?users["`\]]?)/i,
      `$1${quoteIdentifier(TEMP_TABLE)}`
    )
    .replace(roleCheckPattern, `$1${insertion}`);

  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN;');
    db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(TEMP_TABLE)};`);
    db.exec(`${createTempSql};`);
    db.exec(
      `INSERT INTO ${quoteIdentifier(TEMP_TABLE)} (${quotedColumns}) SELECT ${quotedColumns} FROM users;`
    );
    db.exec('DROP TABLE users;');
    db.exec(`ALTER TABLE ${quoteIdentifier(TEMP_TABLE)} RENAME TO users;`);
    for (const object of dependentObjects) db.exec(`${object.sql};`);
    db.exec('COMMIT;');
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_rollbackError) {}
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (!tableExists('users')) return;

  ensureRoleCheck(db);

  addColumnIfMissing('users', 'funcao', 'funcao TEXT');
  addColumnIfMissing('users', 'setor', 'setor TEXT');
  addColumnIfMissing('users', 'qr_token', 'qr_token TEXT');
  addColumnIfMissing('users', 'qr_ativo', 'qr_ativo INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('users', 'qr_emitido_em', 'qr_emitido_em TEXT');
  addColumnIfMissing('users', 'qr_revogado_em', 'qr_revogado_em TEXT');

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_qr_token ON users(qr_token) WHERE qr_token IS NOT NULL;');

  const rows = db.prepare('SELECT id, role, funcao, setor FROM users').all();
  const update = db.prepare(`
    UPDATE users
    SET funcao = COALESCE(NULLIF(TRIM(funcao), ''), ?),
        setor = COALESCE(NULLIF(TRIM(setor), ''), ?)
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    for (const row of rows) {
      const derived = deriveUserFunctionSector(row.role);
      if (!derived.funcao && !derived.setor) continue;
      update.run(derived.funcao, derived.setor, Number(row.id));
    }
  });
  tx();

  if (tableExists('estoque_movimentos')) {
    addColumnIfMissing(
      'estoque_movimentos',
      'retirado_por_user_id',
      'retirado_por_user_id INTEGER REFERENCES users(id)'
    );
    db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_mov_retirado_por_user ON estoque_movimentos(retirado_por_user_id);');
  }

  const foreignKeyErrors = db.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeyErrors.length) {
    throw new Error(`Falha de integridade após migration 202: ${JSON.stringify(foreignKeyErrors)}`);
  }
};
