PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS preventiva_planos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento_id INTEGER,
  titulo TEXT NOT NULL,
  frequencia_tipo TEXT NOT NULL DEFAULT 'mensal', -- diario|semanal|mensal|anual|horimetro
  frequencia_valor INTEGER NOT NULL DEFAULT 1,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id)
);

CREATE TABLE IF NOT EXISTS preventiva_execucoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id INTEGER NOT NULL,
  data_prevista TEXT,      -- YYYY-MM-DD
  data_executada TEXT,     -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente|executada|atrasada|cancelada
  responsavel TEXT,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(plano_id) REFERENCES preventiva_planos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prev_planos_equip ON preventiva_planos(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_prev_exec_plano ON preventiva_execucoes(plano_id);
CREATE INDEX IF NOT EXISTS idx_prev_exec_status ON preventiva_execucoes(status);
