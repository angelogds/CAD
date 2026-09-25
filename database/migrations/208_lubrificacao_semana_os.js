module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pcm_lubrificacao_semanas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semana_inicio TEXT NOT NULL UNIQUE,
      semana_fim TEXT NOT NULL,
      responsavel_user_id INTEGER NOT NULL,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(responsavel_user_id) REFERENCES users(id),
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(updated_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS pcm_lubrificacao_os_programadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semana_id INTEGER NOT NULL,
      data_programada TEXT NOT NULL,
      equipamento_id INTEGER NOT NULL,
      os_id INTEGER,
      responsavel_user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'GERADA',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(data_programada, equipamento_id),
      FOREIGN KEY(semana_id) REFERENCES pcm_lubrificacao_semanas(id),
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id),
      FOREIGN KEY(os_id) REFERENCES os(id),
      FOREIGN KEY(responsavel_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_lubrificacao_semanas_periodo
      ON pcm_lubrificacao_semanas(semana_inicio, semana_fim);

    CREATE INDEX IF NOT EXISTS idx_lubrificacao_os_data
      ON pcm_lubrificacao_os_programadas(data_programada, equipamento_id);
  `);

  if (tableExists('pcm_lubrificacao_execucoes')) {
    addColumnIfMissing('pcm_lubrificacao_execucoes', 'semana_id', 'semana_id INTEGER');
    addColumnIfMissing('pcm_lubrificacao_execucoes', 'os_id', 'os_id INTEGER');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lubrificacao_execucoes_semana
        ON pcm_lubrificacao_execucoes(semana_id, executed_at);
      CREATE INDEX IF NOT EXISTS idx_lubrificacao_execucoes_os
        ON pcm_lubrificacao_execucoes(os_id);
    `);
  }
};
