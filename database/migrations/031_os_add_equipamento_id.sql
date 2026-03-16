PRAGMA foreign_keys = ON;

-- Adiciona vínculo opcional com a tabela equipamentos (sem remover o campo texto "equipamento")
ALTER TABLE os ADD COLUMN equipamento_id INTEGER;

-- Índice para performance nas buscas
CREATE INDEX IF NOT EXISTS idx_os_equipamento_id ON os(equipamento_id);
