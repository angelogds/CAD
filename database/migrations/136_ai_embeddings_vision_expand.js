module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (tableExists('os')) {
    addColumnIfMissing('os', 'ai_diagnostico', 'ai_diagnostico TEXT');
    addColumnIfMissing('os', 'ai_sugestao', 'ai_sugestao TEXT');
    addColumnIfMissing('os', 'ai_embedding', 'ai_embedding TEXT');
    addColumnIfMissing('os', 'ai_criticidade', 'ai_criticidade TEXT');
  }

  if (tableExists('equipamentos')) {
    addColumnIfMissing('equipamentos', 'embedding', 'embedding TEXT');
    addColumnIfMissing('equipamentos', 'historico_falhas_json', "historico_falhas_json TEXT DEFAULT '[]'");
  }

  if (tableExists('preventiva_planos')) {
    addColumnIfMissing('preventiva_planos', 'embedding', 'embedding TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entidade_tipo TEXT NOT NULL,
      entidade_id INTEGER NOT NULL,
      texto_base TEXT,
      vetor_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ai_embeddings_entidade ON ai_embeddings(entidade_tipo, entidade_id);
    CREATE INDEX IF NOT EXISTS idx_os_ai_criticidade ON os(ai_criticidade);
  `);
};
