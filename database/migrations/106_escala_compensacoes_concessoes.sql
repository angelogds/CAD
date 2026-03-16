PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS escala_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  colaborador_id INTEGER NOT NULL,
  funcao TEXT NOT NULL DEFAULT 'mecanico',
  turno TEXT NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id)
);

CREATE INDEX IF NOT EXISTS idx_escala_entries_periodo
  ON escala_entries(inicio, fim);

CREATE TABLE IF NOT EXISTS escala_compensacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  colaborador_id INTEGER NOT NULL,
  funcao TEXT NOT NULL,
  data_servico TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  minutos_total INTEGER NOT NULL,
  concessao_sugerida TEXT NOT NULL CHECK (concessao_sugerida IN ('MEIA', 'INTEIRA', 'SEM_DIREITO')),
  equipamento TEXT,
  descricao_servico TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id)
);

CREATE INDEX IF NOT EXISTS idx_escala_compensacoes_data
  ON escala_compensacoes(data_servico);

CREATE TABLE IF NOT EXISTS escala_concessoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  colaborador_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('FOLGA','FERIAS','ATESTADO')),
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  concessao TEXT NOT NULL CHECK (concessao IN ('INTEIRA','MEIA','NAO_APLICA')),
  motivo TEXT,
  ref_compensacao_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id),
  FOREIGN KEY(ref_compensacao_id) REFERENCES escala_compensacoes(id)
);

CREATE INDEX IF NOT EXISTS idx_escala_concessoes_periodo
  ON escala_concessoes(inicio, fim);
