module.exports = function up({ db, addColumnIfMissing, tableExists, columnExists }) {
  addColumnIfMissing("preventiva_planos", "origem", "origem TEXT NOT NULL DEFAULT 'AUTOMATICA'");
  addColumnIfMissing("preventiva_execucoes", "origem", "origem TEXT NOT NULL DEFAULT 'AUTOMATICA'");

  if (tableExists("preventiva_planos") && columnExists("preventiva_planos", "origem")) {
    db.exec("UPDATE preventiva_planos SET origem = COALESCE(NULLIF(UPPER(origem), ''), 'AUTOMATICA')");
  }
  if (tableExists("preventiva_execucoes") && columnExists("preventiva_execucoes", "origem")) {
    db.exec("UPDATE preventiva_execucoes SET origem = COALESCE(NULLIF(UPPER(origem), ''), 'AUTOMATICA')");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS preventiva_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      preventiva_execucao_id INTEGER,
      preventiva_plano_id INTEGER,
      acao TEXT NOT NULL,
      usuario_id INTEGER,
      usuario_nome TEXT,
      detalhes_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(preventiva_execucao_id) REFERENCES preventiva_execucoes(id) ON DELETE SET NULL,
      FOREIGN KEY(preventiva_plano_id) REFERENCES preventiva_planos(id) ON DELETE SET NULL,
      FOREIGN KEY(usuario_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_preventiva_logs_execucao ON preventiva_logs(preventiva_execucao_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_preventiva_logs_plano ON preventiva_logs(preventiva_plano_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_preventiva_logs_acao ON preventiva_logs(acao, created_at DESC);
  `);
};
