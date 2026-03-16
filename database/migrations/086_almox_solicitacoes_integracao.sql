PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS solicitacao_vinculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER NOT NULL UNIQUE,
  tipo_origem TEXT NOT NULL DEFAULT 'AVULSA', -- AVULSA|OS|PREVENTIVA
  origem_id INTEGER,
  equipamento_id INTEGER,
  destino_uso TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes_compra(id) ON DELETE CASCADE,
  FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id)
);

CREATE INDEX IF NOT EXISTS idx_solic_vinculos_tipo ON solicitacao_vinculos(tipo_origem);

CREATE TABLE IF NOT EXISTS solicitacao_cotacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER NOT NULL,
  fornecedor TEXT NOT NULL,
  valor_total REAL NOT NULL DEFAULT 0,
  observacao TEXT,
  anexo_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes_compra(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_solic_cotacoes_sol ON solicitacao_cotacoes(solicitacao_id);

CREATE TABLE IF NOT EXISTS almox_funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS almox_retiradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantidade REAL NOT NULL,
  finalidade TEXT,
  destino TEXT,
  solicitacao_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(funcionario_id) REFERENCES almox_funcionarios(id),
  FOREIGN KEY(item_id) REFERENCES estoque_itens(id),
  FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes_compra(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_almox_retiradas_item ON almox_retiradas(item_id);
CREATE INDEX IF NOT EXISTS idx_almox_retiradas_func ON almox_retiradas(funcionario_id);
