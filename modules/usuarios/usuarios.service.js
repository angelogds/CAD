// modules/usuarios/usuarios.service.js
const bcrypt = require("bcryptjs");
const db = require("../../database/db");
const { normalizeWhatsapp } = require("../../utils/whatsapp-phone");

// compatível com seu CHECK do SQLite

function normalizePersonName(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bluis\b/g, "luiz");
}

function syncColaboradorWhatsappFromUser({ userId, name, telefone }) {
  const normalizedPhone = normalizeWhatsapp(telefone) || null;

  const linked = db.prepare("SELECT id FROM colaboradores WHERE user_id = ? LIMIT 1").get(Number(userId));
  if (linked) {
    db.prepare("UPDATE colaboradores SET telefone_whatsapp = ?, updated_at = datetime('now') WHERE id = ?").run(normalizedPhone, Number(linked.id));
    return;
  }
  if (!normalizedPhone) return;

  const wanted = normalizePersonName(name);
  if (!wanted) return;
  const rows = db.prepare("SELECT id, nome FROM colaboradores WHERE COALESCE(deleted_at, '') = ''").all();
  const match = rows.find((row) => normalizePersonName(row.nome) === wanted);
  if (!match) return;

  db.prepare("UPDATE colaboradores SET user_id = ?, telefone_whatsapp = ?, updated_at = datetime('now') WHERE id = ?").run(Number(userId), normalizedPhone, Number(match.id));
}

const VALID_ROLES = new Set(["ADMIN", "DIRECAO", "DIRETORIA", "RH", "COMPRAS", "ENCARREGADO_PRODUCAO", "PRODUCAO", "MECANICO", "ALMOXARIFE", "ALMOXARIFADO", "MANUTENCAO", "MANUTENCAO_SUPERVISOR", "INSPECAO_QUALIDADE"]);

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
    SELECT id, name, email, role, photo_path, telefone_whatsapp, created_at
    FROM users
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY id DESC
  `;

  return db.prepare(sql).all(params);
}

function getById(id) {
  return db.prepare("SELECT id, name, email, role, photo_path, telefone_whatsapp, created_at FROM users WHERE id = ?").get(id);
}

function getByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

function create({ name, email, role, password, photo_path, telefone_whatsapp }) {
  const r = String(role || "").toUpperCase();
  if (!VALID_ROLES.has(r)) {
    throw new Error(`Perfil inválido. Use: ${Array.from(VALID_ROLES).join(", ")}`);
  }

  const exists = getByEmail(email);
  if (exists) throw new Error("Já existe usuário com esse e-mail.");

  const telefone = normalizeWhatsapp(telefone_whatsapp);
  const password_hash = bcrypt.hashSync(password, 10);
  const created_at = new Date().toISOString();

  db.prepare(
    "INSERT INTO users (name, email, password_hash, role, photo_path, telefone_whatsapp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(name, email, password_hash, r, photo_path || null, telefone, created_at);
}

function update(id, { name, email, role, photo_path, telefone_whatsapp }) {
  const current = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!current) throw new Error("Usuário não encontrado.");

  const r = String(role || "").toUpperCase();
  if (!VALID_ROLES.has(r)) {
    throw new Error(`Perfil inválido. Use: ${Array.from(VALID_ROLES).join(", ")}`);
  }

  const other = db.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").get(email, id);
  if (other) throw new Error("Este e-mail já está sendo usado por outro usuário.");

  const telefone = normalizeWhatsapp(telefone_whatsapp);

  if (photo_path) {
    db.prepare("UPDATE users SET name = ?, email = ?, role = ?, photo_path = ?, telefone_whatsapp = ? WHERE id = ?").run(name, email, r, photo_path, telefone, id);
    syncColaboradorWhatsappFromUser({ userId: id, name, telefone });
    return;
  }

  db.prepare("UPDATE users SET name = ?, email = ?, role = ?, telefone_whatsapp = ? WHERE id = ?").run(name, email, r, telefone, id);
  syncColaboradorWhatsappFromUser({ userId: id, name, telefone });
}

function resetPassword(id, password) {
  const current = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!current) throw new Error("Usuário não encontrado.");

  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(password_hash, id);
}

function remove(id, actorUserId = null) {
  const user = db.prepare("SELECT id, name FROM users WHERE id = ?").get(id);
  if (!user) throw new Error("Usuário não encontrado.");

  if (Number(actorUserId || 0) === Number(id)) {
    throw new Error("Você não pode apagar o próprio usuário logado.");
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

module.exports = { list, getById, create, update, resetPassword, remove };
