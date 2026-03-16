PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS escala_ausencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  colaborador_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('folga','atestado')),
  data_inicio TEXT NOT NULL, -- YYYY-MM-DD
  data_fim TEXT NOT NULL,    -- YYYY-MM-DD
  motivo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id)
);

CREATE INDEX IF NOT EXISTS idx_escala_ausencias_colab
  ON escala_ausencias(colaborador_id);

CREATE INDEX IF NOT EXISTS idx_escala_ausencias_periodo
  ON escala_ausencias(data_inicio, data_fim);
