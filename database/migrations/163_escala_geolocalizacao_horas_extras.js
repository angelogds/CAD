module.exports = ({ db, tableExists, addColumnIfMissing }) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS escala_horas_extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER,
      data_servico TEXT,
      hora_inicio TEXT,
      hora_fim TEXT,
      latitude_inicio REAL,
      longitude_inicio REAL,
      precisao_inicio REAL,
      status_localizacao_inicio TEXT,
      distancia_inicio_metros REAL,
      latitude_fim REAL,
      longitude_fim REAL,
      precisao_fim REAL,
      status_localizacao_fim TEXT,
      distancia_fim_metros REAL,
      justificativa_sem_localizacao TEXT,
      observacao TEXT,
      status_aprovacao TEXT NOT NULL DEFAULT 'PENDENTE_ANALISE',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  for (const table of ['escala_horas_extras', 'escala_compensacoes']) {
    if (!tableExists(table)) continue;
    addColumnIfMissing(table, 'latitude_inicio', 'latitude_inicio REAL');
    addColumnIfMissing(table, 'longitude_inicio', 'longitude_inicio REAL');
    addColumnIfMissing(table, 'precisao_inicio', 'precisao_inicio REAL');
    addColumnIfMissing(table, 'status_localizacao_inicio', 'status_localizacao_inicio TEXT');
    addColumnIfMissing(table, 'distancia_inicio_metros', 'distancia_inicio_metros REAL');
    addColumnIfMissing(table, 'latitude_fim', 'latitude_fim REAL');
    addColumnIfMissing(table, 'longitude_fim', 'longitude_fim REAL');
    addColumnIfMissing(table, 'precisao_fim', 'precisao_fim REAL');
    addColumnIfMissing(table, 'status_localizacao_fim', 'status_localizacao_fim TEXT');
    addColumnIfMissing(table, 'distancia_fim_metros', 'distancia_fim_metros REAL');
    addColumnIfMissing(table, 'justificativa_sem_localizacao', 'justificativa_sem_localizacao TEXT');
    addColumnIfMissing(table, 'alerta_localizacao', 'alerta_localizacao INTEGER NOT NULL DEFAULT 0');
  }
};
