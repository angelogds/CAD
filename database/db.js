// database/db.js
const path = require("path");
const fs = require("fs");
const storage = require("../config/storage");

const dbPath = storage.DB_PATH;

// garante pasta existente e gravável antes de abrir o banco
const dir = path.dirname(dbPath);
fs.mkdirSync(dir, { recursive: true });
try {
  fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
} catch (error) {
  const msg = `Diretório SQLite sem permissão de leitura/escrita: ${dir}`;
  console.error(`❌ [db] ${msg}`);
  throw new Error(`${msg}. Verifique o volume persistente do Railway (/data).`);
}

function isSqliteIoError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === 'SQLITE_IOERR_SHMSIZE'
    || error?.code === 'SQLITE_IOERR'
    || msg.includes('sqlite_ioerr_shmsize')
    || msg.includes('disk i/o error')
    || msg.includes('shmsize');
}

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
    const isModuleMissing = error?.code === "MODULE_NOT_FOUND" && String(error?.message || "").includes("better-sqlite3");
    if (!isBindingError && !isModuleMissing) throw error;
    console.warn("⚠️ [db] better-sqlite3 indisponível. Usando fallback node:sqlite.");
    return createNodeSqliteCompat(databasePath);
  }
}

let db;
try {
  db = createDatabase(dbPath);
} catch (error) {
  if (isSqliteIoError(error)) {
    console.error(`❌ [db] Falha de I/O ao abrir SQLite em ${dbPath}: ${error.message || error}`);
    console.error('❌ [db] O volume persistente pode estar cheio ou sem suporte seguro a WAL/SHM. Libere espaço e execute npm run db:manutencao.');
  }
  throw error;
}

function applyPragmas(database) {
  // Try WAL mode first — it eliminates SQLITE_IOERR_SHMSIZE by using memory-mapped
  // shared memory instead of the -shm file, and dramatically improves concurrency.
  const walPragmas = [
    ['journal_mode', 'WAL'],
    ['synchronous', 'NORMAL'],
    ['cache_size', '-64000'],   // 64 MB page cache
    ['temp_store', 'MEMORY'],   // temp tables in RAM
    ['mmap_size', '30000000'],  // 30 MB memory-mapped I/O
    ['busy_timeout', '10000'],  // 10 s busy wait before SQLITE_BUSY
    ['foreign_keys', 'ON'],
  ];

  try {
    for (const [key, value] of walPragmas) {
      database.pragma(`${key} = ${value}`);
    }
    console.log('✅ [db] SQLite WAL mode + optimised pragmas applied.');
    return;
  } catch (error) {
    if (isSqliteIoError(error)) {
      console.error(`❌ [db] Erro SQLite I/O/SHM ao aplicar PRAGMA WAL: ${error.message || error}`);
      console.warn('⚠️ [db] Tentando fallback com journal_mode=DELETE...');
    } else {
      console.warn(`⚠️ [db] Falha ao aplicar pragmas WAL (${error.message || error}). Tentando fallback DELETE...`);
    }
  }

  // Fallback: DELETE journal mode (no -wal/-shm files, safer on some volumes)
  try {
    database.pragma('journal_mode = DELETE');
    database.pragma('synchronous = NORMAL');
    database.pragma('cache_size = -64000');
    database.pragma('temp_store = MEMORY');
    database.pragma('busy_timeout = 10000');
    database.pragma('foreign_keys = ON');
    console.warn('⚠️ [db] Fallback aplicado com journal_mode=DELETE.');
  } catch (fallbackError) {
    throw new Error(`SQLite não abriu com segurança após fallback DELETE: ${fallbackError.message || fallbackError}`);
  }
}

// pragmas base seguros para Railway Volume
applyPragmas(db);

/**
 * withRetry(fn, maxAttempts, delayMs)
 * Execute fn() with exponential backoff on SQLITE_BUSY / SQLITE_IOERR.
 * Use this wrapper for write-heavy operations that may contend.
 */
function withRetry(fn, maxAttempts = 3, delayMs = 100) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastError = err;
      const code = String(err?.code || '');
      const isRetryable = code === 'SQLITE_BUSY'
        || code === 'SQLITE_LOCKED'
        || isSqliteIoError(err);
      if (!isRetryable || attempt === maxAttempts) throw err;
      // Synchronous exponential backoff (acceptable for SQLite retry)
      const wait = delayMs * Math.pow(2, attempt - 1);
      console.warn(`⚠️ [db] Retry ${attempt}/${maxAttempts} after ${wait}ms (${code || err.message})`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  throw lastError;
}

// Expose withRetry on the db object so other modules can use it
db.withRetry = withRetry;

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
