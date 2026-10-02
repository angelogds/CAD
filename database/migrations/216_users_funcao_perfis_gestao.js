const TEMP_TABLE = 'users_funcao_profile_fix_tmp';

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

module.exports = function up({ db, tableExists }) {
  if (!tableExists('users')) return;

  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  const createSql = String(row?.sql || '');
  if (!createSql) throw new Error('Não foi possível identificar o schema da tabela users.');

  const legacyFuncaoCheck = /CHECK\s*\(\s*funcao\s+IN\s*\(\s*'MECANICO'\s*,\s*'MONTADOR'\s*,\s*'AUXILIAR'\s*\)\s*\)/i;
  if (!legacyFuncaoCheck.test(createSql)) return;

  const columns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  const dependentObjects = db.prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE tbl_name='users' AND type IN ('index','trigger') AND sql IS NOT NULL"
  ).all();
  const quotedColumns = columns.map(quoteIdentifier).join(', ');

  const createTempSql = createSql
    .replace(
      /^(\s*CREATE\s+TABLE\s+)(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\[]?users["`\]]?)/i,
      `$1${quoteIdentifier(TEMP_TABLE)}`
    )
    .replace(legacyFuncaoCheck, "CHECK (funcao IS NULL OR length(trim(funcao)) > 0)");

  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN;');
    db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(TEMP_TABLE)};`);
    db.exec(`${createTempSql};`);
    db.exec(`INSERT INTO ${quoteIdentifier(TEMP_TABLE)} (${quotedColumns}) SELECT ${quotedColumns} FROM users;`);
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

  const errors = db.prepare('PRAGMA foreign_key_check').all();
  if (errors.length) {
    throw new Error(`Falha de integridade após corrigir CHECK legado de users.funcao: ${JSON.stringify(errors)}`);
  }
};
