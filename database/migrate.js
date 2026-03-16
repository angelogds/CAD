// database/migrate.js
const fs = require("fs");
const path = require("path");
const db = require("./db");

function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function isApplied(filename) {
  const row = db.prepare("SELECT 1 FROM migrations WHERE filename = ?").get(filename);
  return !!row;
}

function markApplied(filename) {
  db.prepare("INSERT INTO migrations (filename) VALUES (?)").run(filename);
}

function tableExists(name) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
  return !!row;
}

function columnExists(table, column) {
  if (!tableExists(table)) return false;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

/**
 * FIX: Se estoque_itens já existe (criada antes) e não tem "categoria",
 * adiciona a coluna ANTES de rodar 080_estoque_core.sql
 */
function ensureEstoqueCategoriaColumn() {
  if (!tableExists("estoque_itens")) return;

  if (!columnExists("estoque_itens", "categoria")) {
    console.log("🛠️ Hotfix: adicionando coluna 'categoria' em estoque_itens...");
    db.exec(`ALTER TABLE estoque_itens ADD COLUMN categoria TEXT NOT NULL DEFAULT 'DIVERSOS';`);
    console.log("✅ Coluna 'categoria' adicionada.");
  }
}

function addColumnIfMissing(table, column, ddl) {
  if (!tableExists(table)) return;
  if (columnExists(table, column)) return;
  console.log(`🛠️ Hotfix: adicionando coluna '${column}' em ${table}...`);
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function ensureOSExecucoesAutoAlocacaoColumns() {
  addColumnIfMissing("os_execucoes", "auxiliar_user_id", "auxiliar_user_id INTEGER REFERENCES users(id)");
  addColumnIfMissing("os_execucoes", "alocado_por", "alocado_por INTEGER REFERENCES users(id)");
}

function ensureOSInspectionColumns() {
  if (!tableExists("os")) return;
  const needed = [
    ["resumo_tecnico", "TEXT"],
    ["causa_diagnostico", "TEXT"],
    ["data_fim", "TEXT"],
  ];

  for (const [col, type] of needed) {
    if (!columnExists("os", col)) {
      console.log(`🛠️ Hotfix: adicionando coluna '${col}' em os...`);
      db.exec(`ALTER TABLE os ADD COLUMN ${col} ${type};`);
    }
  }
}

function applyOne(filename) {
  const full = path.join(__dirname, "migrations", filename);
  const isSql = filename.endsWith(".sql");
  const isJs = filename.endsWith(".js");

  try {
    // ✅ antes da 080, garante coluna categoria (corrige banco já existente)
    if (filename === "080_estoque_core.sql") {
      ensureEstoqueCategoriaColumn();
    }
    if (filename === "104_os_inspecao_auto_fields.sql") {
      ensureOSInspectionColumns();
    }

    if (filename === "114_os_auto_alocacao.sql") {
      ensureOSExecucoesAutoAlocacaoColumns();
    }

    if (isSql) {
      const sql = fs.readFileSync(full, "utf8");

      // PRAGMA foreign_keys só tem efeito fora de transação no SQLite.
      // Algumas migrations (ex.: recriação da tabela users) precisam rodar sem tx.
      const needsNoTx = /PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(sql);

      if (needsNoTx) {
        db.exec(sql);
        markApplied(filename);
      } else {
        const tx = db.transaction(() => {
          db.exec(sql);
          markApplied(filename);
        });
        tx();
      }
    } else if (isJs) {
      const migrationModule = require(full);
      const runMigration = typeof migrationModule === "function"
        ? migrationModule
        : migrationModule && typeof migrationModule.up === "function"
          ? migrationModule.up
          : null;

      if (!runMigration) {
        throw new Error("Migration JS inválida: exporte função ou { up() }.");
      }

      runMigration({ db, tableExists, columnExists, addColumnIfMissing });
      markApplied(filename);
    } else {
      throw new Error(`Extensão de migration não suportada: ${filename}`);
    }
    console.log(`✔ Migration aplicada: ${filename}`);
  } catch (err) {
    console.error(`❌ Erro na migration: ${filename}`);
    console.error(`📄 Arquivo: ${full}`);
    console.error("🧨 Detalhes do erro:", err?.message || err);
    process.exit(1);
  }
}

function applyMigrations() {
  ensureMigrationsTable();

  const dir = path.join(__dirname, "migrations");
  if (!fs.existsSync(dir)) {
    console.warn("⚠️ Pasta de migrations não existe:", dir);
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") || f.endsWith(".js"))
    .sort((a, b) => a.localeCompare(b));

  console.log(`🧱 Migrations encontradas (${files.length}):`, files.join(", "));

  for (const f of files) {
    if (isApplied(f)) continue;
    applyOne(f);
  }

  const applied = db.prepare("SELECT filename FROM migrations ORDER BY id").all();
  console.log("📌 Migrations aplicadas:", applied.map((r) => r.filename).join(", "));
}

applyMigrations();
module.exports = { applyMigrations };
