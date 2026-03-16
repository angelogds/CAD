ALTER TABLE equipamento_pecas ADD COLUMN quantidade INTEGER NOT NULL DEFAULT 1;
ALTER TABLE equipamento_pecas ADD COLUMN descricao_item TEXT;

DROP INDEX IF EXISTS uidx_equipamento_pecas_assoc;
CREATE INDEX IF NOT EXISTS idx_equipamento_pecas_itens ON equipamento_pecas(equipamento_id, id);
