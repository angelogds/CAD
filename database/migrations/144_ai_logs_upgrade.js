module.exports.up = ({ db, addColumnIfMissing }) => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      os_id INTEGER,
      tipo TEXT,
      entrada TEXT,
      resposta TEXT,
      tempo_ms INTEGER,
      erro TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `).run();

  addColumnIfMissing('os', 'diagnostico_ia', 'diagnostico_ia TEXT');
  addColumnIfMissing('os', 'causa_ia', 'causa_ia TEXT');
  addColumnIfMissing('os', 'acao_corretiva_ia', 'acao_corretiva_ia TEXT');
  addColumnIfMissing('os', 'acao_preventiva_ia', 'acao_preventiva_ia TEXT');
};
