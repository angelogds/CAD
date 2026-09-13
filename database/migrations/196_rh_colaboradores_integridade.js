function normalizeName(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bluis\b/g, 'luiz');
}

function quoteIdentifier(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function normalizedSql(expr) {
  const replacements = [
    ['Á', 'A'], ['À', 'A'], ['Â', 'A'], ['Ã', 'A'], ['Ä', 'A'],
    ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ã', 'a'], ['ä', 'a'],
    ['É', 'E'], ['È', 'E'], ['Ê', 'E'], ['Ë', 'E'],
    ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
    ['Í', 'I'], ['Ì', 'I'], ['Î', 'I'], ['Ï', 'I'],
    ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'],
    ['Ó', 'O'], ['Ò', 'O'], ['Ô', 'O'], ['Õ', 'O'], ['Ö', 'O'],
    ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['õ', 'o'], ['ö', 'o'],
    ['Ú', 'U'], ['Ù', 'U'], ['Û', 'U'], ['Ü', 'U'],
    ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'],
    ['Ç', 'C'], ['ç', 'c'], ['Ñ', 'N'], ['ñ', 'n'],
  ];

  let sql = `trim(COALESCE(${expr}, ''))`;
  for (const [from, to] of replacements) {
    sql = `replace(${sql}, '${from}', '${to}')`;
  }
  sql = `lower(${sql})`;
  sql = `replace(replace(replace(${sql}, '  ', ' '), '  ', ' '), '  ', ' ')`;
  return sql;
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

module.exports = function up({ db, tableExists, columnExists }) {
  if (!tableExists('colaboradores')) return;
  if (!columnExists('colaboradores', 'ativo') || !columnExists('colaboradores', 'status') || !columnExists('colaboradores', 'deleted_at')) return;

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
    const scored = group.map((row) => ({
      ...row,
      refs: countReferences(db, refs, row.id),
      score: (row.user_id ? 100000 : 0) + (countReferences(db, refs, row.id) * 100) - Number(row.id || 0),
    })).sort((a, b) => b.score - a.score || Number(a.id) - Number(b.id));

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

  const newKey = normalizedSql('NEW.nome');
  const existingKey = normalizedSql('c.nome');
  const oldKey = normalizedSql('OLD.nome');

  db.exec(`
    DROP TRIGGER IF EXISTS trg_colaboradores_nome_duplicado_insert;
    CREATE TRIGGER trg_colaboradores_nome_duplicado_insert
    BEFORE INSERT ON colaboradores
    WHEN COALESCE(NEW.ativo, 1) = 1
      AND COALESCE(NEW.deleted_at, '') = ''
      AND upper(COALESCE(NEW.status, 'ATIVO')) NOT IN ('INATIVO','DESLIGADO','EXCLUIDO','REMOVIDO','APAGADO')
      AND EXISTS (
        SELECT 1
        FROM colaboradores c
        WHERE ${activeSql('c')}
          AND ${existingKey} = ${newKey}
      )
    BEGIN
      SELECT RAISE(ABORT, 'COLABORADOR_DUPLICADO_NOME: já existe um colaborador ativo com este nome. Use o cadastro existente.');
    END;

    DROP TRIGGER IF EXISTS trg_colaboradores_nome_duplicado_update;
    CREATE TRIGGER trg_colaboradores_nome_duplicado_update
    BEFORE UPDATE OF nome, ativo, status, deleted_at ON colaboradores
    WHEN COALESCE(NEW.ativo, 1) = 1
      AND COALESCE(NEW.deleted_at, '') = ''
      AND upper(COALESCE(NEW.status, 'ATIVO')) NOT IN ('INATIVO','DESLIGADO','EXCLUIDO','REMOVIDO','APAGADO')
      AND (
        ${newKey} <> ${oldKey}
        OR COALESCE(OLD.ativo, 1) <> 1
        OR COALESCE(OLD.deleted_at, '') <> ''
        OR upper(COALESCE(OLD.status, 'ATIVO')) IN ('INATIVO','DESLIGADO','EXCLUIDO','REMOVIDO','APAGADO')
      )
      AND EXISTS (
        SELECT 1
        FROM colaboradores c
        WHERE c.id <> OLD.id
          AND ${activeSql('c')}
          AND ${existingKey} = ${newKey}
      )
    BEGIN
      SELECT RAISE(ABORT, 'COLABORADOR_DUPLICADO_NOME: já existe um colaborador ativo com este nome. Use o cadastro existente.');
    END;
  `);
};
