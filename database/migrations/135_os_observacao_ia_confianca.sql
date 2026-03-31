-- Persistência de sinal visual da IA no fechamento de OS
ALTER TABLE os ADD COLUMN observacao_ia TEXT;
ALTER TABLE os ADD COLUMN confianca INTEGER;
