PRAGMA foreign_keys = ON;

ALTER TABLE os ADD COLUMN equipamento_manual TEXT;
ALTER TABLE os ADD COLUMN diagnostico TEXT;
ALTER TABLE os ADD COLUMN acao_executada TEXT;
ALTER TABLE os ADD COLUMN data_inicio TEXT;
ALTER TABLE os ADD COLUMN data_conclusao TEXT;

CREATE TABLE IF NOT EXISTS os_pecas_utilizadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL,
  peca_descricao TEXT NOT NULL,
  quantidade REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_os_pecas_os ON os_pecas_utilizadas(os_id);
CREATE INDEX IF NOT EXISTS idx_os_data_inicio ON os(data_inicio);
CREATE INDEX IF NOT EXISTS idx_os_data_conclusao ON os(data_conclusao);
