-- Fundação ERP V3: fornecedores, cotações estruturadas e vínculos técnicos/comerciais.

CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  telefone TEXT,
  email TEXT,
  cidade TEXT,
  observacoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  lead_time_medio_dias REAL NOT NULL DEFAULT 0,
  qualidade_media_entrega REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_nome ON fornecedores(nome);
CREATE INDEX IF NOT EXISTS idx_fornecedores_ativo ON fornecedores(ativo);

ALTER TABLE solicitacoes ADD COLUMN fornecedor_id INTEGER REFERENCES fornecedores(id);
ALTER TABLE solicitacoes ADD COLUMN tipo_origem TEXT NOT NULL DEFAULT 'OS';

ALTER TABLE solicitacao_itens ADD COLUMN custo_estimado_unit REAL;
ALTER TABLE solicitacao_itens ADD COLUMN custo_real_unit REAL;

ALTER TABLE estoque_itens ADD COLUMN saldo_ideal REAL NOT NULL DEFAULT 0;
ALTER TABLE estoque_itens ADD COLUMN qr_code TEXT;

CREATE TABLE IF NOT EXISTS compras_cotacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitacao_id INTEGER NOT NULL,
  fornecedor_id INTEGER NOT NULL,
  numero_cotacao TEXT,
  valor_total REAL NOT NULL DEFAULT 0,
  prazo_entrega_dias INTEGER,
  condicoes_pagamento TEXT,
  observacoes TEXT,
  escolhida INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE,
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_cotacoes_solicitacao ON compras_cotacoes(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_fornecedor ON compras_cotacoes(fornecedor_id);

CREATE TABLE IF NOT EXISTS compras_historico_preco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estoque_item_id INTEGER NOT NULL,
  fornecedor_id INTEGER,
  solicitacao_item_id INTEGER,
  valor_unitario REAL NOT NULL,
  comprado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (estoque_item_id) REFERENCES estoque_itens(id),
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
  FOREIGN KEY (solicitacao_item_id) REFERENCES solicitacao_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_hist_preco_item_data ON compras_historico_preco(estoque_item_id, comprado_em DESC);

ALTER TABLE os ADD COLUMN tipo_manutencao TEXT NOT NULL DEFAULT 'CORRETIVA';
ALTER TABLE os ADD COLUMN custo_total_materiais REAL NOT NULL DEFAULT 0;
ALTER TABLE os ADD COLUMN custo_total_servicos REAL NOT NULL DEFAULT 0;

CREATE VIEW IF NOT EXISTS vw_indicadores_manutencao AS
SELECT
  date(COALESCE(closed_at, data_fim, opened_at)) AS dia,
  COUNT(*) AS os_fechadas,
  AVG(0) AS mttr_horas,
  SUM(COALESCE(custo_total, 0)) AS custo_total_manutencao
FROM os
WHERE status IN ('FECHADA', 'CONCLUIDA')
GROUP BY date(COALESCE(closed_at, data_fim, opened_at));
