const db = require("../../database/db");

function hasVisibleUntilColumn() {
  try {
    const cols = db.prepare("PRAGMA table_info(avisos)").all();
    return cols.some(function (c) {
      return String(c.name || "").toLowerCase() === "visible_until";
    });
  } catch (_) {
    return false;
  }
}

function listAvisos(limit = 100) {
  const safeLimit = Number(limit) || 100;

  if (hasVisibleUntilColumn()) {
    return db
      .prepare(`
        SELECT a.id, a.titulo, a.mensagem, a.created_at, a.visible_until,
               COALESCE(u.name, 'Sistema') AS autor_nome
        FROM avisos a
        LEFT JOIN users u ON u.id = a.created_by
        ORDER BY a.id DESC
        LIMIT ?
      `)
      .all(safeLimit);
  }

  return db
    .prepare(`
      SELECT a.id, a.titulo, a.mensagem, a.created_at,
             COALESCE(u.name, 'Sistema') AS autor_nome
      FROM avisos a
      LEFT JOIN users u ON u.id = a.created_by
      ORDER BY a.id DESC
      LIMIT ?
    `)
    .all(safeLimit);
}

function normalizeVisibilityDays(days) {
  const n = Number(days);
  if ([7, 15, 30].includes(n)) return n;
  return 7;
}

function createAviso({ titulo, mensagem, createdBy, diasVisiveis }) {
  const days = normalizeVisibilityDays(diasVisiveis);
  const modifier = `+${days} days`;

  if (hasVisibleUntilColumn()) {
    const info = db
      .prepare(`
        INSERT INTO avisos (titulo, mensagem, created_by, visible_until, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now', ?), datetime('now'), datetime('now'))
      `)
      .run(String(titulo || "").trim(), String(mensagem || "").trim(), createdBy || null, modifier);

    return Number(info.lastInsertRowid);
  }

  const info = db
    .prepare(`
      INSERT INTO avisos (titulo, mensagem, created_by, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `)
    .run(String(titulo || "").trim(), String(mensagem || "").trim(), createdBy || null);

  return Number(info.lastInsertRowid);
}

function deleteAviso(id) {
  const info = db.prepare(`DELETE FROM avisos WHERE id = ?`).run(Number(id));
  return Number(info.changes || 0);
}

module.exports = {
  listAvisos,
  createAviso,
  deleteAviso,
};
