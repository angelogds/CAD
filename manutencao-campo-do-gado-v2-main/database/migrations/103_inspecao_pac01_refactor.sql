PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inspecao_pac01_grade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspecao_id INTEGER NOT NULL,
  equipamento_id INTEGER NOT NULL,
  dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 31),
  status TEXT NOT NULL CHECK (status IN ('C','NC','EA','SP')),
  os_id INTEGER,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(inspecao_id, equipamento_id, dia),
  FOREIGN KEY (inspecao_id) REFERENCES inspecoes_pac01(id) ON DELETE CASCADE,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (os_id) REFERENCES os(id)
);

CREATE TABLE IF NOT EXISTS inspecao_pac01_nc (
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

CREATE INDEX IF NOT EXISTS idx_inspecao_pac01_grade_main ON inspecao_pac01_grade(inspecao_id, equipamento_id, dia);
CREATE INDEX IF NOT EXISTS idx_inspecao_pac01_nc_main ON inspecao_pac01_nc(inspecao_id, data_ocorrencia);

INSERT OR IGNORE INTO inspecao_pac01_grade (inspecao_id, equipamento_id, dia, status, os_id, observacao, created_at, updated_at)
SELECT i.inspecao_id, i.equipamento_id, i.dia, i.status, i.os_id, i.observacao, i.created_at, i.updated_at
FROM inspecao_pac01_itens i
WHERE i.equipamento_id IS NOT NULL;

INSERT OR IGNORE INTO inspecao_pac01_grade (inspecao_id, equipamento_id, dia, status, os_id, observacao, created_at, updated_at)
SELECT i.inspecao_id, e.id, i.dia, i.status, i.os_id, i.observacao, i.created_at, i.updated_at
FROM inspecao_pac01_itens i
JOIN equipamentos e ON lower(trim(e.nome)) = lower(trim(i.equipamento_nome))
WHERE i.equipamento_id IS NULL;

INSERT OR IGNORE INTO inspecao_pac01_nc (inspecao_id, equipamento_id, data_ocorrencia, nao_conformidade, acao_corretiva, acao_preventiva, data_correcao, os_id, created_at, updated_at)
SELECT n.inspecao_id, n.equipamento_id, n.data_ocorrencia, n.nao_conformidade, n.acao_corretiva, n.acao_preventiva, n.data_correcao, n.os_id, n.created_at, n.updated_at
FROM inspecao_pac01_nao_conformidades n
WHERE n.equipamento_id IS NOT NULL;

INSERT OR IGNORE INTO inspecao_pac01_nc (inspecao_id, equipamento_id, data_ocorrencia, nao_conformidade, acao_corretiva, acao_preventiva, data_correcao, os_id, created_at, updated_at)
SELECT n.inspecao_id, e.id, n.data_ocorrencia, n.nao_conformidade, n.acao_corretiva, n.acao_preventiva, n.data_correcao, n.os_id, n.created_at, n.updated_at
FROM inspecao_pac01_nao_conformidades n
JOIN equipamentos e ON lower(trim(e.nome)) = lower(trim(n.equipamento_nome))
WHERE n.equipamento_id IS NULL;
