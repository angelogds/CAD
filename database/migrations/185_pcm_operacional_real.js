module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pcm_programacao_semanal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL UNIQUE,
      data_programada TEXT NOT NULL,
      responsavel_user_id INTEGER,
      horas_estimadas REAL NOT NULL DEFAULT 2 CHECK (horas_estimadas > 0),
      status TEXT NOT NULL DEFAULT 'PROGRAMADA',
      observacao TEXT,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(os_id) REFERENCES os(id) ON DELETE CASCADE,
      FOREIGN KEY(responsavel_user_id) REFERENCES users(id),
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(updated_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pcm_programacao_data
      ON pcm_programacao_semanal(data_programada, status);
    CREATE INDEX IF NOT EXISTS idx_pcm_programacao_responsavel
      ON pcm_programacao_semanal(responsavel_user_id, data_programada);

    CREATE TABLE IF NOT EXISTS pcm_ai_analises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      periodo_dias INTEGER NOT NULL DEFAULT 30,
      setor TEXT,
      origem TEXT NOT NULL DEFAULT 'LOCAL',
      status TEXT NOT NULL DEFAULT 'CONCLUIDA',
      entrada_resumo_json TEXT NOT NULL DEFAULT '{}',
      resultado_json TEXT NOT NULL DEFAULT '{}',
      erro_codigo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pcm_ai_analises_filtro
      ON pcm_ai_analises(periodo_dias, setor, created_at DESC);

    CREATE TABLE IF NOT EXISTS pcm_ciclos_operacionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      user_id INTEGER,
      resultado_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
};
