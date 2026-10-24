// Migration incremental: preserva a tabela e as credenciais existentes.
const db = require('../db');
module.exports = function up() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS automacao_dispositivo_estados (
      device_pk INTEGER NOT NULL REFERENCES automacao_dispositivos(id) ON DELETE CASCADE,
      digestor_id INTEGER NOT NULL CHECK(digestor_id BETWEEN 1 AND 4),
      last_fase TEXT NOT NULL CHECK(last_fase IN ('INICIO','MEIO','FINAL')),
      last_payload TEXT,
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (device_pk, digestor_id)
    );
  `);
};
