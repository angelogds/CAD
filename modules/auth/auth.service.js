// modules/auth/auth.service.js
const db = require("../../database/db");

function hasUserColumn(name) {
  try {
    return db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === name);
  } catch (_error) {
    return false;
  }
}

function getUserByEmail(email) {
  if (!email) return null;

  const sidebarField = hasUserColumn('sidebar_mode')
    ? "COALESCE(sidebar_mode,'EXPANDED') AS sidebar_mode"
    : "'EXPANDED' AS sidebar_mode";

  return db
    .prepare(
      `
      SELECT id, name, email, password_hash, role, photo_path, ${sidebarField}
      FROM users
      WHERE lower(email) = lower(?)
        AND COALESCE(ativo, 1) = 1
        AND COALESCE(deleted_at, '') = ''
      LIMIT 1
    `
    )
    .get(email);
}

module.exports = { getUserByEmail };
