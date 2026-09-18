// modules/auth/auth.service.js
const db = require("../../database/db");

function getUserByEmail(email) {
  if (!email) return null;

  return db
    .prepare(
      `
      SELECT id, name, email, password_hash, role, photo_path
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
