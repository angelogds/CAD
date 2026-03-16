ALTER TABLE equipamento_pecas ADD COLUMN unidade_medida TEXT NOT NULL DEFAULT 'UNIDADE';
CREATE INDEX IF NOT EXISTS idx_equipamento_pecas_unidade ON equipamento_pecas(unidade_medida);
