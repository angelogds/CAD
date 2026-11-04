module.exports = ({ db, addColumnIfMissing }) => {
  addColumnIfMissing('demandas', 'requer_instalacao', 'requer_instalacao INTEGER NOT NULL DEFAULT 0 CHECK(requer_instalacao IN (0,1))');
  db.exec(`
    CREATE TABLE IF NOT EXISTS pcm_programacao_demandas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      demanda_id INTEGER NOT NULL REFERENCES demandas(id),
      etapa TEXT NOT NULL CHECK(etapa IN ('SERVICO','INSTALACAO')),
      data_programada TEXT NOT NULL,
      horario TEXT,
      responsavel_user_id INTEGER NOT NULL REFERENCES users(id),
      local_servico TEXT NOT NULL,
      preparacao TEXT,
      horas_estimadas REAL NOT NULL DEFAULT 2 CHECK(horas_estimadas>0 AND horas_estimadas<=72),
      status TEXT NOT NULL DEFAULT 'PROGRAMADA' CHECK(status IN ('PROGRAMADA','EM_ANDAMENTO','CONCLUIDA','CANCELADA')),
      data_realizada TEXT,
      versao INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER NOT NULL REFERENCES users(id),
      updated_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(demanda_id,etapa)
    );
    CREATE INDEX IF NOT EXISTS idx_pcm_demanda_agenda_data ON pcm_programacao_demandas(data_programada,status);
    CREATE INDEX IF NOT EXISTS idx_pcm_demanda_agenda_responsavel ON pcm_programacao_demandas(responsavel_user_id,data_programada);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pcm_agenda_notificacao_versao
      ON notificacoes(user_id,origem_tipo,origem_id,status_referencia) WHERE origem_tipo='PCM_AGENDA';
  `);
};
