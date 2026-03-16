PRAGMA foreign_keys = ON;

-- OS (a sua tabela usa opened_at)
CREATE INDEX IF NOT EXISTS idx_os_status ON os(status);
CREATE INDEX IF NOT EXISTS idx_os_opened_at ON os(opened_at);
CREATE INDEX IF NOT EXISTS idx_os_tipo ON os(tipo);
CREATE INDEX IF NOT EXISTS idx_os_opened_by ON os(opened_by);
CREATE INDEX IF NOT EXISTS idx_os_closed_by ON os(closed_by);

-- Compras (essa tabela tem created_at no 050)
CREATE INDEX IF NOT EXISTS idx_compras_created_at ON compras(created_at);
CREATE INDEX IF NOT EXISTS idx_compras_status ON compras(status);

-- Estoque
CREATE INDEX IF NOT EXISTS idx_estoque_mov_item ON estoque_movimentos(item_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_created_at ON estoque_movimentos(created_at);
