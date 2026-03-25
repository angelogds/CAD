PRAGMA foreign_keys = ON;

ALTER TABLE os ADD COLUMN ai_criticidade_sugerida TEXT;
ALTER TABLE os ADD COLUMN ai_acao_corretiva_sugerida TEXT;
ALTER TABLE os ADD COLUMN ai_acao_preventiva_sugerida TEXT;
ALTER TABLE os ADD COLUMN ai_sugestao_equipe_json TEXT;
ALTER TABLE os ADD COLUMN ai_justificativa_criticidade TEXT;
ALTER TABLE os ADD COLUMN solucao_final_tecnica TEXT;

ALTER TABLE preventiva_planos ADD COLUMN prioridade TEXT;
ALTER TABLE preventiva_planos ADD COLUMN tipo_plano TEXT;
ALTER TABLE preventiva_planos ADD COLUMN checklist_json TEXT;
ALTER TABLE preventiva_planos ADD COLUMN gerado_ia INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_os_ai_criticidade_sugerida ON os(ai_criticidade_sugerida);
CREATE INDEX IF NOT EXISTS idx_preventiva_planos_gerado_ia ON preventiva_planos(gerado_ia);
