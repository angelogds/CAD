// database/db.js
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// Railway: use DB_PATH=/data/app.db (com volume montado em /data)
const defaultDevPath = path.join(__dirname, "db.sqlite");
const dbPath = process.env.DB_PATH || defaultDevPath;

// garante pasta existente
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);

// pragmas base
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function tableExists(name) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
  return !!row;
}

function osHasFKToUsersOld() {
  try {
    const fks = db.prepare(`PRAGMA foreign_key_list(os)`).all();
    return fks.some((fk) => String(fk.table || "").toLowerCase() === "users_old");
  } catch (_e) {
    return false;
  }
}

/**
 * ✅ Correção DEFINITIVA (sem desligar FK):
 * Se existir FK em os -> users_old e a tabela users_old não existir,
 * criamos users_old (mínimo: id) e sincronizamos com users por triggers.
 *
 * Isso elimina o erro: "não existe tal tabela: main.users_old"
 * e evita gambiarra de PRAGMA foreign_keys = OFF.
 */
function ensureUsersOldCompat() {
  const needCompat = osHasFKToUsersOld();
  if (!needCompat) return;

  if (!tableExists("users_old")) {
    console.log("⚠️ [db] FK detectada: os -> users_old, mas users_old não existe.");
    console.log("🛠️ [db] Criando tabela compat users_old + triggers de sync (solução definitiva).");

    // cria tabela mínima
    db.exec(`
      CREATE TABLE IF NOT EXISTS users_old (
        id INTEGER PRIMARY KEY
      );
    `);

    // popula com ids existentes (users)
    try {
      db.exec(`
        INSERT OR IGNORE INTO users_old (id)
        SELECT id FROM users;
      `);
    } catch (_e) {
      // se por algum motivo não existir users ainda, ignora
    }

    // cria triggers para manter sync
    db.exec(`
      DROP TRIGGER IF EXISTS trg_users_ai_users_old;
      DROP TRIGGER IF EXISTS trg_users_ad_users_old;
      DROP TRIGGER IF EXISTS trg_users_au_users_old;

      CREATE TRIGGER trg_users_ai_users_old
      AFTER INSERT ON users
      BEGIN
        INSERT OR IGNORE INTO users_old (id) VALUES (NEW.id);
      END;

      CREATE TRIGGER trg_users_ad_users_old
      AFTER DELETE ON users
      BEGIN
        DELETE FROM users_old WHERE id = OLD.id;
      END;

      CREATE TRIGGER trg_users_au_users_old
      AFTER UPDATE OF id ON users
      BEGIN
        UPDATE users_old SET id = NEW.id WHERE id = OLD.id;
      END;
    `);

    // reforça FK ON
    db.pragma("foreign_keys = ON");
    console.log("✅ [db] users_old compat criado e sincronizado. foreign_keys permanece ON.");
  } else {
    // tabela existe: garante que tenha todos ids de users
    try {
      db.exec(`
        INSERT OR IGNORE INTO users_old (id)
        SELECT id FROM users;
      `);
    } catch (_e) {}
  }
}

// roda ao iniciar
try {
  ensureUsersOldCompat();
} catch (e) {
  console.log("⚠️ [db] Não foi possível aplicar compat users_old:", e.message || e);
  // fallback (último caso): mantém ON mesmo assim
  try {
    db.pragma("foreign_keys = ON");
  } catch (_e) {}
}

module.exports = db;
