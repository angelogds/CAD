PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inspecoes_pac01 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  frequencia TEXT NOT NULL DEFAULT 'Diária',
  monitor_nome TEXT,
  verificador_nome TEXT,
  criado_por INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(mes, ano),
  FOREIGN KEY (criado_por) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inspecao_pac01_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspecao_id INTEGER NOT NULL,
  equipamento_id INTEGER,
  equipamento_nome TEXT NOT NULL,
  dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 31),
  status TEXT NOT NULL CHECK (status IN ('C','NC','EA','SP')),
  os_id INTEGER,
  observacao TEXT,
  is_manual INTEGER NOT NULL DEFAULT 0 CHECK (is_manual IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(inspecao_id, equipamento_nome, dia),
  FOREIGN KEY (inspecao_id) REFERENCES inspecoes_pac01(id) ON DELETE CASCADE,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (os_id) REFERENCES os(id)
);

CREATE TABLE IF NOT EXISTS inspecao_pac01_nao_conformidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspecao_id INTEGER NOT NULL,
  equipamento_id INTEGER,
  equipamento_nome TEXT NOT NULL,
  data_ocorrencia TEXT NOT NULL,
  nao_conformidade TEXT NOT NULL,
  acao_corretiva TEXT,
  acao_preventiva TEXT,
  data_correcao TEXT,
  os_id INTEGER,
  os_data_inicio TEXT,
  os_data_fim TEXT,
  causa_parada TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(inspecao_id, equipamento_nome, data_ocorrencia, os_id),
  FOREIGN KEY (inspecao_id) REFERENCES inspecoes_pac01(id) ON DELETE CASCADE,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (os_id) REFERENCES os(id)
);

CREATE INDEX IF NOT EXISTS idx_inspecao_pac01_mes_ano ON inspecoes_pac01(ano, mes);
CREATE INDEX IF NOT EXISTS idx_inspecao_pac01_itens_main ON inspecao_pac01_itens(inspecao_id, equipamento_nome, dia);
CREATE INDEX IF NOT EXISTS idx_inspecao_pac01_nc_main ON inspecao_pac01_nao_conformidades(inspecao_id, data_ocorrencia);
