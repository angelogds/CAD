PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS demandas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  prioridade TEXT NOT NULL DEFAULT 'NORMAL', -- BAIXA|NORMAL|ALTA|URGENTE
  status TEXT NOT NULL DEFAULT 'NOVA', -- NOVA|EM_ANALISE|EM_ANDAMENTO|PARADA|CONCLUIDA|CANCELADA
  created_by INTEGER NOT NULL,
  responsavel_user_id INTEGER,
  ultima_atualizacao TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(responsavel_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_demandas_status ON demandas(status);
CREATE INDEX IF NOT EXISTS idx_demandas_prioridade ON demandas(prioridade);
CREATE INDEX IF NOT EXISTS idx_demandas_created_by ON demandas(created_by);

CREATE TABLE IF NOT EXISTS demanda_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id INTEGER NOT NULL,
  user_id INTEGER,
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(demanda_id) REFERENCES demandas(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_demanda_logs_demanda ON demanda_logs(demanda_id);
