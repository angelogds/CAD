// database/db.js
const path = require("path");
const fs = require("fs");
const storage = require("../config/storage");

const dbPath = storage.DB_PATH;

// garante pasta existente
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function createNodeSqliteCompat(databasePath) {
  // fallback nativo do Node.js para ambientes sem binário do better-sqlite3
  const { DatabaseSync } = require("node:sqlite");
  const nativeDb = new DatabaseSync(databasePath);

  const normalizeResult = (result) => ({
    changes: Number(result?.changes || 0),
    lastInsertRowid: Number(result?.lastInsertRowid || 0),
  });

  return {
    exec(sql) {
      return nativeDb.exec(sql);
    },
    pragma(statement) {
      return nativeDb.exec(`PRAGMA ${statement}`);
    },
    prepare(sql) {
      const stmt = nativeDb.prepare(sql);
      return {
        run(...args) {
          return normalizeResult(stmt.run(...args));
        },
        get(...args) {
          return stmt.get(...args);
        },
        all(...args) {
          return stmt.all(...args);
        },
      };
    },
    transaction(fn) {
      return (...args) => {
        nativeDb.exec("BEGIN");
        try {
          const result = fn(...args);
          nativeDb.exec("COMMIT");
          return result;
        } catch (error) {
          nativeDb.exec("ROLLBACK");
          throw error;
        }
      };
    },
  };
}

function createDatabase(databasePath) {
  try {
    const BetterSqlite3 = require("better-sqlite3");
    return new BetterSqlite3(databasePath);
  } catch (error) {
    const isBindingError = /Could not locate the bindings file/i.test(String(error?.message || ""));
    if (!isBindingError) throw error;
    console.warn("⚠️ [db] better-sqlite3 indisponível. Usando fallback node:sqlite.");
    return createNodeSqliteCompat(databasePath);
  }
}

const db = createDatabase(dbPath);

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
