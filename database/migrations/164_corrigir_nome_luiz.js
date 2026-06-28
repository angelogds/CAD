function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
}

function updateIdReferences(db, table, oldIds, novoId, shouldUpdateColumn) {
  if (!oldIds.length || !novoId) return;
  const placeholders = oldIds.map(() => '?').join(',');

  for (const tableName of tableNames(db)) {
    const tableColumns = columns(db, tableName);
    const fkColumns = db.prepare(`PRAGMA foreign_key_list(${quoteIdent(tableName)})`).all()
      .filter((fk) => fk.table === table)
      .map((fk) => fk.from);

    const candidateColumns = tableColumns
      .map((column) => column.name)
      .filter((columnName) => fkColumns.includes(columnName) || shouldUpdateColumn(columnName));

    for (const columnName of new Set(candidateColumns)) {
      db.prepare(`
        UPDATE ${quoteIdent(tableName)}
        SET ${quoteIdent(columnName)} = ?
        WHERE ${quoteIdent(columnName)} IN (${placeholders})
      `).run(novoId, ...oldIds);
    }
  }
}

function normalizarPessoa(db, table, nameColumn, shouldUpdateColumn) {
  const registros = db.prepare(`
    SELECT id, ${quoteIdent(nameColumn)} AS nome
    FROM ${quoteIdent(table)}
    WHERE ${quoteIdent(nameColumn)} IN ('Luiz', 'Luis', 'Luís')
    ORDER BY CASE WHEN ${quoteIdent(nameColumn)} = 'Luiz' THEN 0 ELSE 1 END, id
  `).all();
  if (!registros.length) return;

  const registroOficial = registros.find((row) => row.nome === 'Luiz') || registros[0];
  const idOficial = registroOficial.id;
  const idsAntigos = registros.filter((row) => row.id !== idOficial).map((row) => row.id);

  db.prepare(`UPDATE ${quoteIdent(table)} SET ${quoteIdent(nameColumn)} = 'Luiz' WHERE id = ?`).run(idOficial);
  updateIdReferences(db, table, idsAntigos, idOficial, shouldUpdateColumn);

  if (idsAntigos.length) {
    const placeholders = idsAntigos.map(() => '?').join(',');
    db.prepare(`DELETE FROM ${quoteIdent(table)} WHERE id IN (${placeholders})`).run(...idsAntigos);
  }
}

function normalizarTextos(db) {
  for (const tableName of tableNames(db)) {
    for (const column of columns(db, tableName)) {
      const type = String(column.type || '').toUpperCase();
      if (!type.includes('TEXT') && !type.includes('CHAR') && !type.includes('CLOB') && !type.includes('JSON')) continue;
      db.prepare(`
        UPDATE ${quoteIdent(tableName)}
        SET ${quoteIdent(column.name)} = REPLACE(REPLACE(${quoteIdent(column.name)}, 'Luís', 'Luiz'), 'Luis', 'Luiz')
        WHERE ${quoteIdent(column.name)} LIKE '%Luis%' OR ${quoteIdent(column.name)} LIKE '%Luís%'
      `).run();
    }
  }
}

module.exports = function up({ db, tableExists, columnExists }) {
  db.exec('PRAGMA foreign_keys = OFF');

  if (tableExists('colaboradores') && columnExists('colaboradores', 'id') && columnExists('colaboradores', 'nome')) {
    normalizarPessoa(db, 'colaboradores', 'nome', (columnName) => /(^|_)colaborador_id$/.test(columnName));
  }

  if (tableExists('users') && columnExists('users', 'id') && columnExists('users', 'name')) {
    normalizarPessoa(db, 'users', 'name', (columnName) => /(^|_)user_id$/.test(columnName));
  }

  normalizarTextos(db);

  db.exec('PRAGMA foreign_keys = ON');
};
