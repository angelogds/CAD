function normalizeName(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function quoteIdentifier(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function activeSql(alias) {
  return `COALESCE(${alias}.ativo, 1) = 1
    AND COALESCE(${alias}.deleted_at, '') = ''
    AND upper(COALESCE(${alias}.status, 'ATIVO')) NOT IN ('INATIVO','DESLIGADO','EXCLUIDO','REMOVIDO','APAGADO')`;
}

function foreignKeyReferences(db) {
  const refs = [];
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const row of tables) {
    const table = String(row.name || '');
    if (!table) continue;
    let fks = [];
    try { fks = db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all(); }
    catch (_error) { continue; }
    for (const fk of fks) {
      if (String(fk.table || '').toLowerCase() !== 'colaboradores' || !fk.from) continue;
      refs.push({ table, column: String(fk.from) });
    }
  }
  return refs;
}

function countReferences(db, refs, colaboradorId) {
  let total = 0;
  for (const ref of refs) {
    try {
      total += Number(db.prepare(
        `SELECT COUNT(*) AS total FROM ${quoteIdentifier(ref.table)} WHERE ${quoteIdentifier(ref.column)} = ?`
      ).get(Number(colaboradorId))?.total || 0);
    } catch (_error) {}
  }
  return total;
}

function ensureIntegrityColumns(db, columnExists) {
  if (!columnExists('colaboradores', 'nome_integridade')) {
    db.exec('ALTER TABLE colaboradores ADD COLUMN nome_integridade TEXT');
  }
  if (!columnExists('colaboradores', 'integridade_pendente')) {
    db.exec('ALTER TABLE colaboradores ADD COLUMN integridade_pendente INTEGER NOT NULL DEFAULT 0');
  }
}

function createNormalizationTriggers(db) {
  // A normalização é feita em vários UPDATEs simples de propósito. Evita
  // expressões aninhadas profundas, que estouram o parser do better-sqlite3.
  const normalizeStatements = [
    "UPDATE colaboradores SET nome_integridade = lower(trim(COALESCE(nome, ''))) WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Á', 'A') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'À', 'A') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Â', 'A') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Ã', 'A') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'É', 'E') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Ê', 'E') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Í', 'I') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Ó', 'O') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Ô', 'O') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Õ', 'O') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Ú', 'U') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'Ç', 'C') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'á', 'a') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'à', 'a') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'â', 'a') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'ã', 'a') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'é', 'e') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'ê', 'e') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'í', 'i') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'ó', 'o') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'ô', 'o') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'õ', 'o') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'ú', 'u') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, 'ç', 'c') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(replace(replace(nome_integridade, '-', ' '), '.', ' '), '''', ' ') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, '  ', ' ') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = replace(nome_integridade, '  ', ' ') WHERE id = NEW.id;",
    "UPDATE colaboradores SET nome_integridade = trim(nome_integridade) WHERE id = NEW.id;",
  ].join('\n      ');

  db.exec(`
    DROP TRIGGER IF EXISTS trg_colaboradores_nome_integridade_insert;
    CREATE TRIGGER trg_colaboradores_nome_integridade_insert
    AFTER INSERT ON colaboradores
    BEGIN
      ${normalizeStatements}
    END;

    DROP TRIGGER IF EXISTS trg_colaboradores_nome_integridade_update;
    CREATE TRIGGER trg_colaboradores_nome_integridade_update
    AFTER UPDATE OF nome ON colaboradores
    BEGIN
      ${normalizeStatements}
    END;
  `);
}

module.exports = function up({ db, tableExists, columnExists }) {
  if (!tableExists('colaboradores')) return;
  if (!columnExists('colaboradores', 'ativo') || !columnExists('colaboradores', 'status') || !columnExists('colaboradores', 'deleted_at')) return;

  ensureIntegrityColumns(db, columnExists);

  db.exec(`
    CREATE TABLE IF NOT EXISTS colaboradores_integridade_alertas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave_nome TEXT NOT NULL,
      colaborador_canonico_id INTEGER NOT NULL,
      colaborador_duplicado_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDENTE_REVISAO',
      detalhe TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      UNIQUE(chave_nome, colaborador_canonico_id, colaborador_duplicado_id),
      FOREIGN KEY(colaborador_canonico_id) REFERENCES colaboradores(id),
      FOREIGN KEY(colaborador_duplicado_id) REFERENCES colaboradores(id)
    );
    CREATE INDEX IF NOT EXISTS idx_colab_integridade_status
      ON colaboradores_integridade_alertas(status, created_at);
  `);

  const rows = db.prepare(`
    SELECT id, nome, user_id, ativo, status, deleted_at
    FROM colaboradores
    WHERE COALESCE(ativo, 1) = 1
      AND COALESCE(deleted_at, '') = ''
      AND upper(COALESCE(status, 'ATIVO')) NOT IN ('INATIVO','DESLIGADO','EXCLUIDO','REMOVIDO','APAGADO')
    ORDER BY id ASC
  `).all();

  const groups = new Map();
  for (const row of rows) {
    const key = normalizeName(row.nome);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const refs = foreignKeyReferences(db);
  const updateGhost = db.prepare(`
    UPDATE colaboradores
    SET ativo = 0,
        status = 'INATIVO',
        deleted_at = COALESCE(NULLIF(deleted_at, ''), datetime('now')),
        integridade_pendente = 0,
        updated_at = datetime('now')
    WHERE id = ?
  `);
  const markPending = db.prepare(`
    UPDATE colaboradores
    SET integridade_pendente = 1,
        updated_at = datetime('now')
    WHERE id = ?
  `);
  const insertAlert = db.prepare(`
    INSERT OR IGNORE INTO colaboradores_integridade_alertas
      (chave_nome, colaborador_canonico_id, colaborador_duplicado_id, status, detalhe, created_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
  `);

  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;
    const scored = group.map((row) => {
      const referenceCount = countReferences(db, refs, row.id);
      return {
        ...row,
        refs: referenceCount,
        score: (row.user_id ? 100000 : 0) + (referenceCount * 100) - Number(row.id || 0),
      };
    }).sort((a, b) => b.score - a.score || Number(a.id) - Number(b.id));

    const canonical = scored[0];
    for (const duplicate of scored.slice(1)) {
      const safeGhost = !duplicate.user_id && Number(duplicate.refs || 0) === 0;
      if (safeGhost) {
        updateGhost.run(Number(duplicate.id));
        insertAlert.run(
          key,
          Number(canonical.id),
          Number(duplicate.id),
          'AUTO_INATIVADO',
          `Cadastro duplicado sem usuário e sem referências históricas. Preservado como inativo; canônico #${canonical.id}.`,
          new Date().toISOString()
        );
      } else {
        markPending.run(Number(duplicate.id));
        insertAlert.run(
          key,
          Number(canonical.id),
          Number(duplicate.id),
          'PENDENTE_REVISAO',
          `Possível duplicidade preservada para revisão: ${duplicate.refs} referência(s) e user_id=${duplicate.user_id || 'não vinculado'}.`,
          null
        );
      }
    }
  }

  const updateKey = db.prepare('UPDATE colaboradores SET nome_integridade = ? WHERE id = ?');
  const allRows = db.prepare('SELECT id, nome FROM colaboradores').all();
  for (const row of allRows) updateKey.run(normalizeName(row.nome), Number(row.id));

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_colaboradores_nome_integridade_ativo
      ON colaboradores(nome_integridade)
      WHERE COALESCE(ativo, 1) = 1
        AND COALESCE(deleted_at, '') = ''
        AND upper(COALESCE(status, 'ATIVO')) NOT IN ('INATIVO','DESLIGADO','EXCLUIDO','REMOVIDO','APAGADO')
        AND COALESCE(integridade_pendente, 0) = 0
        AND COALESCE(nome_integridade, '') <> '';
  `);

  createNormalizationTriggers(db);
};
