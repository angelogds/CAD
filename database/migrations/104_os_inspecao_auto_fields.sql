PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inspecao_pac01_nao_conformidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspecao_id INTEGER NOT NULL,
  equipamento_id INTEGER NOT NULL,
  data_ocorrencia TEXT NOT NULL,
  nao_conformidade TEXT NOT NULL,
  acao_corretiva TEXT,
  acao_preventiva TEXT,
  data_correcao TEXT,
  os_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(inspecao_id, equipamento_id, data_ocorrencia, os_id),
  FOREIGN KEY (inspecao_id) REFERENCES inspecoes_pac01(id) ON DELETE CASCADE,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (os_id) REFERENCES os(id)
);

CREATE INDEX IF NOT EXISTS idx_inspecao_pac01_nao_conformidades_main
ON inspecao_pac01_nao_conformidades(inspecao_id, data_ocorrencia);

INSERT OR IGNORE INTO inspecao_pac01_nao_conformidades (
  inspecao_id, equipamento_id, data_ocorrencia, nao_conformidade,
  acao_corretiva, acao_preventiva, data_correcao, os_id, created_at, updated_at
)
SELECT
  inspecao_id, equipamento_id, data_ocorrencia, nao_conformidade,
  acao_corretiva, acao_preventiva, data_correcao, os_id, created_at, updated_at
FROM inspecao_pac01_nc;
