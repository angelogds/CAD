PRAGMA foreign_keys = ON;

-- ITENS DE ESTOQUE
CREATE TABLE IF NOT EXISTS estoque_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT,
  nome TEXT NOT NULL,
  unidade TEXT DEFAULT 'un',     -- un|kg|l|m etc
  estoque_min REAL DEFAULT 0,
  custo_unit REAL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_estoque_itens_codigo ON estoque_itens(codigo);
CREATE INDEX IF NOT EXISTS idx_estoque_itens_nome ON estoque_itens(nome);
CREATE INDEX IF NOT EXISTS idx_estoque_itens_ativo ON estoque_itens(ativo);


-- MOVIMENTAÇÕES
CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,                 -- entrada|saida|ajuste
  quantidade REAL NOT NULL,
  custo_unit REAL,
  origem TEXT,                        -- compra|os|ajuste|inventario
  referencia_id INTEGER,              -- id da compra/OS etc
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(item_id) REFERENCES estoque_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_item ON estoque_movimentos(item_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_tipo ON estoque_movimentos(tipo);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_created ON estoque_movimentos(created_at);


-- SOLICITAÇÕES DE COMPRA (cabecalho)
CREATE TABLE IF NOT EXISTS solicitacoes_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitante TEXT,
  setor TEXT,
  status TEXT NOT NULL DEFAULT 'aberta', -- aberta|cotacao|aprovada|comprada|recebida|cancelada
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes_compra(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_created ON solicitacoes_compra(created_at);

-- ITENS DA SOLICITAÇÃO
CREATE TABLE IF NOT EXISTS solicitacao_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER NOT NULL,
  item_id INTEGER,             -- pode ser NULL se item ainda não cadastrado
  descricao TEXT NOT NULL,     -- texto livre
  quantidade REAL NOT NULL DEFAULT 1,
  unidade TEXT DEFAULT 'un',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes_compra(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES estoque_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_solicitacao ON solicitacao_itens(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_item ON solicitacao_itens(item_id);


-- COMPRAS / RECEBIMENTO (cabecalho)
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER,
  fornecedor TEXT,
  status TEXT NOT NULL DEFAULT 'em_andamento', -- em_andamento|recebida|cancelada
  data_compra TEXT,
  data_recebimento TEXT,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes_compra(id)
);

CREATE INDEX IF NOT EXISTS idx_compras_status ON compras(status);
CREATE INDEX IF NOT EXISTS idx_compras_solicitacao ON compras(solicitacao_id);


-- ITENS COMPRADOS
CREATE TABLE IF NOT EXISTS compra_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL,
  item_id INTEGER,
  descricao TEXT NOT NULL,
  quantidade REAL NOT NULL,
  custo_unit REAL DEFAULT 0,
  unidade TEXT DEFAULT 'un',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES estoque_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_compra_itens_compra ON compra_itens(compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_itens_item ON compra_itens(item_id);

