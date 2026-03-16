// modules/usuarios/usuarios.service.js
const bcrypt = require("bcryptjs");
const db = require("../../database/db");

// compatível com seu CHECK do SQLite
const VALID_ROLES = new Set(["ADMIN", "DIRECAO", "RH", "COMPRAS", "ENCARREGADO_PRODUCAO", "PRODUCAO", "MECANICO", "ALMOXARIFE", "MANUTENCAO"]);

function list({ q = "", role = "" } = {}) {
  const where = [];
  const params = {};

  if (q) {
    where.push("(name LIKE @q OR email LIKE @q)");
    params.q = `%${q}%`;
  }
  if (role) {
    where.push("role = @role");
    params.role = String(role).toUpperCase();
  }

  const sql = `
    SELECT id, name, email, role, photo_path, created_at
    FROM users
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY id DESC
  `;

  return db.prepare(sql).all(params);
}

function getById(id) {
  return db.prepare("SELECT id, name, email, role, photo_path, created_at FROM users WHERE id = ?").get(id);
}

function getByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

function create({ name, email, role, password, photo_path }) {
  const r = String(role || "").toUpperCase();
  if (!VALID_ROLES.has(r)) {
    throw new Error(`Perfil inválido. Use: ${Array.from(VALID_ROLES).join(", ")}`);
  }

  const exists = getByEmail(email);
  if (exists) throw new Error("Já existe usuário com esse e-mail.");

  const password_hash = bcrypt.hashSync(password, 10);
  const created_at = new Date().toISOString();

  db.prepare(
    "INSERT INTO users (name, email, password_hash, role, photo_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(name, email, password_hash, r, photo_path || null, created_at);
}

function update(id, { name, email, role, photo_path }) {
  const current = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!current) throw new Error("Usuário não encontrado.");

  const r = String(role || "").toUpperCase();
  if (!VALID_ROLES.has(r)) {
    throw new Error(`Perfil inválido. Use: ${Array.from(VALID_ROLES).join(", ")}`);
  }

  const other = db.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").get(email, id);
  if (other) throw new Error("Este e-mail já está sendo usado por outro usuário.");

  if (photo_path) {
    db.prepare("UPDATE users SET name = ?, email = ?, role = ?, photo_path = ? WHERE id = ?").run(name, email, r, photo_path, id);
    return;
  }

  db.prepare("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?").run(name, email, r, id);
}

function resetPassword(id, password) {
  const current = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!current) throw new Error("Usuário não encontrado.");

  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(password_hash, id);
}

module.exports = { list, getById, create, update, resetPassword };
