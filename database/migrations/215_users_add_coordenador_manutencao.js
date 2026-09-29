const NEW_ROLE = "COORDENADOR_RECICLAGEM";
const TEMP_TABLE = "users_coordenador_reciclagem_tmp";

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

module.exports = function up({ db, tableExists }) {
  if (!tableExists("users")) return;
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  const createUsersSql = String(row?.sql || "");
  if (!createUsersSql || createUsersSql.includes(`'${NEW_ROLE}'`)) return;

  const roleCheckPattern = /(role\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*role\s+IN\s*\()/i;
  if (!roleCheckPattern.test(createUsersSql)) {
    throw new Error("CHECK de role não encontrado na tabela users.");
  }

  const columns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  const dependentObjects = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE tbl_name='users' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
  const quotedColumns = columns.map(quoteIdentifier).join(", ");
  const createTempSql = createUsersSql
    .replace(/^(\s*CREATE\s+TABLE\s+)(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\[]?users["`\]]?)/i, `$1${quoteIdentifier(TEMP_TABLE)}`)
    .replace(roleCheckPattern, `$1'${NEW_ROLE}', `);

  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    db.exec("BEGIN;");
    db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(TEMP_TABLE)};`);
    db.exec(`${createTempSql};`);
    db.exec(`INSERT INTO ${quoteIdentifier(TEMP_TABLE)} (${quotedColumns}) SELECT ${quotedColumns} FROM users;`);
    db.exec("DROP TABLE users;");
    db.exec(`ALTER TABLE ${quoteIdentifier(TEMP_TABLE)} RENAME TO users;`);
    for (const object of dependentObjects) db.exec(`${object.sql};`);
    db.exec("COMMIT;");
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch (_rollbackError) {}
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }

  const errors = db.prepare("PRAGMA foreign_key_check").all();
  if (errors.length) throw new Error(`Falha de integridade ao adicionar COORDENADOR_RECICLAGEM: ${JSON.stringify(errors)}`);
};
