function isForeignKeyConstraint(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code.includes("SQLITE_CONSTRAINT_FOREIGNKEY")
    || /FOREIGN KEY constraint failed/i.test(message);
}

function getUser(db, id) {
  return db.prepare(
    "SELECT id, name, COALESCE(ativo, 1) AS ativo, deleted_at FROM users WHERE id = ?"
  ).get(Number(id));
}

function archiveUser(db, id) {
  const result = db.prepare(`
    UPDATE users
    SET ativo = 0,
        deleted_at = COALESCE(deleted_at, datetime('now'))
    WHERE id = ?
  `).run(Number(id));

  if (!result.changes) throw new Error("Usuário não encontrado.");

  return { action: "archived" };
}

function removeOrArchiveUser(db, id, actorUserId = null) {
  const user = getUser(db, id);
  if (!user) throw new Error("Usuário não encontrado.");

  if (Number(actorUserId || 0) === Number(id)) {
    throw new Error("Você não pode remover o próprio usuário logado.");
  }

  try {
    db.prepare("DELETE FROM users WHERE id = ?").run(Number(id));
    return { action: "deleted" };
  } catch (error) {
    if (!isForeignKeyConstraint(error)) throw error;
    return archiveUser(db, id);
  }
}

function restoreUser(db, id) {
  const user = getUser(db, id);
  if (!user) throw new Error("Usuário não encontrado.");

  db.prepare(`
    UPDATE users
    SET ativo = 1,
        deleted_at = NULL
    WHERE id = ?
  `).run(Number(id));

  return { action: "restored" };
}

module.exports = {
  isForeignKeyConstraint,
  removeOrArchiveUser,
  restoreUser,
};
