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

function tableHasFKTo(tableName, referencedTableName) {
  try {
    const fks = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all();
    return fks.some((fk) => String(fk.table || "").toLowerCase() === String(referencedTableName || "").toLowerCase());
  } catch (_e) {
    return false;
  }
}

function listTables() {
  try {
    return db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map((row) => row.name)
      .filter(Boolean);
  } catch (_e) {
    return [];
  }
}

function hasAnyFKTo(tableName) {
  const target = String(tableName || "").toLowerCase();
  if (!target) return false;
  return listTables().some((tbl) => tableHasFKTo(tbl, target));
}

/**
 * ✅ Correção DEFINITIVA (sem desligar FK):
 * Se existir FK em os -> users_old e a tabela users_old não existir,
 * criamos users_old (mínimo: id) e sincronizamos com users por triggers.
 *
 * Isso elimina o erro: "não existe tal tabela: main.users_old"
 * e evita gambiarra de PRAGMA foreign_keys = OFF.
 */
function ensureUsersCompatTable(targetTable) {
  const needCompat = hasAnyFKTo(targetTable);
  if (!needCompat) return;

  if (!tableExists(targetTable)) {
    console.log(`⚠️ [db] FK detectada para '${targetTable}', mas '${targetTable}' não existe.`);
    console.log(`🛠️ [db] Criando tabela compat '${targetTable}' + triggers de sync (solução definitiva).`);

    // cria tabela mínima
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${targetTable} (
        id INTEGER PRIMARY KEY
      );
    `);

    // popula com ids existentes (users)
    try {
      db.exec(`
        INSERT OR IGNORE INTO ${targetTable} (id)
        SELECT id FROM users;
      `);
    } catch (_e) {
      // se por algum motivo não existir users ainda, ignora
    }

    // cria triggers para manter sync
    const triggerSuffix = String(targetTable).replace(/[^a-zA-Z0-9_]/g, "_");
    db.exec(`
      DROP TRIGGER IF EXISTS trg_users_ai_${triggerSuffix};
      DROP TRIGGER IF EXISTS trg_users_ad_${triggerSuffix};
      DROP TRIGGER IF EXISTS trg_users_au_${triggerSuffix};

      CREATE TRIGGER trg_users_ai_${triggerSuffix}
      AFTER INSERT ON users
      BEGIN
        INSERT OR IGNORE INTO ${targetTable} (id) VALUES (NEW.id);
      END;

      CREATE TRIGGER trg_users_ad_${triggerSuffix}
      AFTER DELETE ON users
      BEGIN
        DELETE FROM ${targetTable} WHERE id = OLD.id;
      END;

      CREATE TRIGGER trg_users_au_${triggerSuffix}
      AFTER UPDATE OF id ON users
      BEGIN
        UPDATE ${targetTable} SET id = NEW.id WHERE id = OLD.id;
      END;
    `);

    // reforça FK ON
    db.pragma("foreign_keys = ON");
    console.log(`✅ [db] '${targetTable}' compat criado e sincronizado. foreign_keys permanece ON.`);
  } else {
    // tabela existe: garante que tenha todos ids de users
    try {
      db.exec(`
        INSERT OR IGNORE INTO ${targetTable} (id)
        SELECT id FROM users;
      `);
    } catch (_e) {}
  }
}

// roda ao iniciar
try {
  ensureUsersCompatTable("users_old");
  ensureUsersCompatTable("users_legacy_roles_tmp");
} catch (e) {
  console.log("⚠️ [db] Não foi possível aplicar tabelas de compatibilidade de usuários:", e.message || e);
  // fallback (último caso): mantém ON mesmo assim
  try {
    db.pragma("foreign_keys = ON");
  } catch (_e) {}
}

module.exports = db;
