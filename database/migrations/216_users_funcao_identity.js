// A função passou a ser uma descrição de identidade na migration 202.
// Bancos antigos ainda carregam a enumeração operacional da migration 115.
const TEMP_TABLE = 'users_funcao_identity_tmp';
const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

module.exports = function up({ db, tableExists }) {
  if (!tableExists('users')) return;
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get().sql;
  const legacyFunction = /funcao\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'AUXILIAR'\s+CHECK\s*\(\s*funcao\s+IN\s*\(\s*'MECANICO'\s*,\s*'MONTADOR'\s*,\s*'AUXILIAR'\s*\)\s*\)/i;
  if (!legacyFunction.test(sql)) return;

  const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => quote(c.name)).join(', ');
  const objects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='users' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
  const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='users'").get();
  const foreignKeys = db.prepare('PRAGMA foreign_keys').get().foreign_keys;
  const legacyAlter = db.prepare('PRAGMA legacy_alter_table').get().legacy_alter_table;
  const create = sql.replace(legacyFunction, "funcao TEXT DEFAULT 'AUXILIAR'")
    .replace(/^(\s*CREATE\s+TABLE\s+)(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\[]?users["`\]]?)/i, `$1${quote(TEMP_TABLE)}`);

  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  try {
    db.exec('BEGIN IMMEDIATE;');
    db.exec(create);
    db.exec(`INSERT INTO ${quote(TEMP_TABLE)} (${columns}) SELECT ${columns} FROM users;`);
    db.exec('DROP TABLE users;');
    db.exec(`ALTER TABLE ${quote(TEMP_TABLE)} RENAME TO users;`);
    for (const object of objects) db.exec(object.sql);
    if (sequence) db.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name='users'").run(sequence.seq);
    const errors = db.prepare('PRAGMA foreign_key_check').all();
    if (errors.length) throw new Error('Falha de integridade na migração da função dos usuários.');
    db.exec('COMMIT;');
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  } finally {
    db.exec(`PRAGMA foreign_keys = ${foreignKeys}; PRAGMA legacy_alter_table = ${legacyAlter};`);
  }
};
