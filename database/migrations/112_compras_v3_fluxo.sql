-- Compras V3: cotações múltiplas, anexos e histórico de preços (compatível com V2)

CREATE TABLE IF NOT EXISTS compras_cotacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER NOT NULL,
  fornecedor_id INTEGER,
  fornecedor_nome TEXT,
  valor_total REAL,
  prazo_entrega TEXT,
  observacao TEXT,
  selecionada INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE,
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
);

CREATE INDEX IF NOT EXISTS idx_cotacoes_solicitacao ON compras_cotacoes(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_fornecedor ON compras_cotacoes(fornecedor_id);

CREATE TABLE IF NOT EXISTS anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referencia_tipo TEXT NOT NULL,
  referencia_id INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'COTACAO',
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  uploaded_by INTEGER,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_anexos_ref ON anexos(referencia_tipo, referencia_id);

CREATE TABLE IF NOT EXISTS historico_precos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estoque_item_id INTEGER,
  item_nome TEXT,
  fornecedor_id INTEGER,
  fornecedor_nome TEXT,
  preco_unit REAL,
  preco_total REAL,
  unidade TEXT,
  data_compra TEXT,
  solicitacao_id INTEGER,
  FOREIGN KEY (estoque_item_id) REFERENCES estoque_itens(id),
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
  FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id)
);

CREATE INDEX IF NOT EXISTS idx_hist_item ON historico_precos(estoque_item_id, item_nome);
CREATE INDEX IF NOT EXISTS idx_hist_forn ON historico_precos(fornecedor_id, fornecedor_nome);
