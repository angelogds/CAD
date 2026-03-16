PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pcm_planos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento_id INTEGER NOT NULL,
  atividade_descricao TEXT NOT NULL,
  tipo_manutencao TEXT NOT NULL DEFAULT 'PREVENTIVA', -- PREVENTIVA | INSPECAO | LUBRIFICACAO | PREDITIVA
  frequencia_dias INTEGER,
  frequencia_horas INTEGER,
  proxima_data_prevista TEXT,
  ultima_execucao_em TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  observacao TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pcm_execucoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id INTEGER NOT NULL,
  os_id INTEGER,
  tipo_evento TEXT NOT NULL DEFAULT 'EXECUCAO', -- GERADA_OS | EXECUCAO
  observacao TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (plano_id) REFERENCES pcm_planos(id),
  FOREIGN KEY (os_id) REFERENCES os(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pcm_planos_equipamento ON pcm_planos(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_pcm_planos_tipo ON pcm_planos(tipo_manutencao);
CREATE INDEX IF NOT EXISTS idx_pcm_planos_proxima ON pcm_planos(proxima_data_prevista);
CREATE INDEX IF NOT EXISTS idx_pcm_execucoes_plano ON pcm_execucoes(plano_id, created_at DESC);
