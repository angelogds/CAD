PRAGMA foreign_keys = ON;

-- Garante índices (o FK já está no CREATE TABLE do 050_estoque_compras.sql)
CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_solicitacao ON solicitacao_itens(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_item ON solicitacao_itens(item_id);
