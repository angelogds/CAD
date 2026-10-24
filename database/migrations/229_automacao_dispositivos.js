const db = require('../db');

module.exports = function up() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS automacao_dispositivos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL UNIQUE,
      digestor_id INTEGER CHECK(digestor_id IS NULL OR digestor_id BETWEEN 1 AND 4),
      nome TEXT,
      token_hash TEXT UNIQUE,
      token_hint TEXT,
      status TEXT NOT NULL DEFAULT 'ATIVO' CHECK(status IN ('ATIVO','REVOGADO')),
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      rotated_at TEXT,
      revoked_at TEXT,
      last_seen_at TEXT,
      last_fase TEXT,
      last_payload TEXT
    );
  `);
};
