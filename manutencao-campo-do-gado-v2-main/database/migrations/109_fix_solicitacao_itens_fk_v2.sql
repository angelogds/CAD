PRAGMA foreign_keys=OFF;

-- Preserva tabelas legadas sem apagar dados
ALTER TABLE solicitacoes_compra RENAME TO solicitacoes_compra_legacy;
ALTER TABLE solicitacao_itens RENAME TO solicitacao_itens_legacy;

-- Remove índices antigos (nomes serão reaproveitados na tabela V2)
DROP INDEX IF EXISTS idx_solicitacao_itens_sol;
DROP INDEX IF EXISTS idx_solicitacao_itens_item;
DROP INDEX IF EXISTS idx_solicitacao_itens_solicitacao;

-- Recria tabela V2 com FK correta para solicitacoes(id)
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
  updated_at TEXT,
  FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE,
  FOREIGN KEY (categoria_id) REFERENCES estoque_categorias(id),
  FOREIGN KEY (estoque_item_id) REFERENCES estoque_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_sol ON solicitacao_itens(solicitacao_id);

PRAGMA foreign_keys=ON;
