PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS solicitacoes_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitante TEXT NOT NULL,
  setor TEXT NOT NULL DEFAULT 'MANUTENCAO',
  status TEXT NOT NULL DEFAULT 'ABERTA', -- ABERTA|COTACAO|APROVADA|COMPRADA|RECEBIDA|CANCELADA
  observacao TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes_compra(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_created ON solicitacoes_compra(created_at);

CREATE TABLE IF NOT EXISTS solicitacao_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER NOT NULL,
  item_id INTEGER,                 -- opcional (vincula ao estoque_itens)
  descricao TEXT NOT NULL,
  especificacao TEXT,
  quantidade REAL NOT NULL DEFAULT 1,
  unidade TEXT NOT NULL DEFAULT 'UN',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes_compra(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES estoque_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_sol ON solicitacao_itens(solicitacao_id);

CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER,
  fornecedor TEXT,
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO', -- EM_ANDAMENTO|RECEBIDA|CANCELADA
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes_compra(id)
);

CREATE INDEX IF NOT EXISTS idx_compras_status ON compras(status);

CREATE TABLE IF NOT EXISTS compra_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL,
  item_id INTEGER,
  descricao TEXT NOT NULL,
  quantidade REAL NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  custo_unit REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES estoque_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_compra_itens_compra ON compra_itens(compra_id);

