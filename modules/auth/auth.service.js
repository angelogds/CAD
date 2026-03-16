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
      LIMIT 1
    `
    )
    .get(email);
}

module.exports = { getUserByEmail };
