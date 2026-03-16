CREATE TABLE IF NOT EXISTS solicitacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE,
  solicitante_user_id INTEGER NOT NULL,
  setor_origem TEXT NOT NULL DEFAULT 'Manutenção',
  prioridade TEXT NOT NULL DEFAULT 'MEDIA',
  titulo TEXT NOT NULL,
  descricao TEXT,
  equipamento_id INTEGER,
  preventiva_id INTEGER,
  os_id INTEGER,
  demanda_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ABERTA',
  compras_user_id INTEGER,
  almox_user_id INTEGER,
  cotacao_inicio_em TEXT,
  comprada_em TEXT,
  recebimento_inicio_em TEXT,
  recebida_em TEXT,
  fechada_em TEXT,
  reaberta_em TEXT,
  observacoes_compras TEXT,
  fornecedor TEXT,
  previsao_entrega TEXT,
  valor_total REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (solicitante_user_id) REFERENCES users(id),
  FOREIGN KEY (compras_user_id) REFERENCES users(id),
  FOREIGN KEY (almox_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_solicitante ON solicitacoes(solicitante_user_id);

CREATE TABLE IF NOT EXISTS solicitacao_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER NOT NULL,
  item_nome TEXT NOT NULL,
  item_descricao TEXT,
  unidade TEXT NOT NULL DEFAULT 'UN',
  categoria_id INTEGER,
  estoque_item_id INTEGER,
  qtd_solicitada REAL NOT NULL,
  qtd_recebida_total REAL NOT NULL DEFAULT 0,
  status_item TEXT NOT NULL DEFAULT 'PENDENTE',
  observacao_item TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE,
  FOREIGN KEY (categoria_id) REFERENCES estoque_categorias(id),
  FOREIGN KEY (estoque_item_id) REFERENCES estoque_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_sol ON solicitacao_itens(solicitacao_id);

CREATE TABLE IF NOT EXISTS estoque_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  parent_id INTEGER,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_id) REFERENCES estoque_categorias(id)
);

CREATE TABLE IF NOT EXISTS estoque_locais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS estoque_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  nome TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  categoria_id INTEGER,
  local_id INTEGER,
  saldo_atual REAL NOT NULL DEFAULT 0,
  saldo_minimo REAL NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (categoria_id) REFERENCES estoque_categorias(id),
  FOREIGN KEY (local_id) REFERENCES estoque_locais(id)
);

CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  data_mov TEXT NOT NULL DEFAULT (datetime('now')),
  item_id INTEGER NOT NULL,
  quantidade REAL NOT NULL,
  valor_unitario REAL,
  usuario_id INTEGER,
  referencia_tipo TEXT,
  referencia_id INTEGER,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES estoque_itens(id),
  FOREIGN KEY (usuario_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_item ON estoque_movimentos(item_id, data_mov DESC);
