PRAGMA foreign_keys = ON;

-- remove índices errados (se existirem)
DROP INDEX IF EXISTS idx_os_created_at;
DROP INDEX IF EXISTS idx_compra_created_at;

-- cria índices corretos
CREATE INDEX IF NOT EXISTS idx_os_opened_at ON os(opened_at);
CREATE INDEX IF NOT EXISTS idx_compras_created_at ON compras(created_at);
