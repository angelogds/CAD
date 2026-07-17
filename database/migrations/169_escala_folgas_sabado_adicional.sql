CREATE TABLE IF NOT EXISTS escala_folgas_sabado (
  id INTEGER PRIMARY KEY AUTOINCREMENT, semana_id INTEGER NOT NULL UNIQUE,
  data_sexta TEXT NOT NULL, colaborador_folga_id INTEGER NOT NULL,
  motivo_folga TEXT NOT NULL DEFAULT 'PLANTAO_NOTURNO', justificativa_outro TEXT,
  data_sabado TEXT NOT NULL, colaborador_fixo_id INTEGER, parceiro_diogo_id INTEGER NOT NULL,
  substituto_diogo_id INTEGER, situacao TEXT NOT NULL DEFAULT 'PREVISTA', observacao TEXT,
  responsavel_id INTEGER, autorizado_por INTEGER, criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT,
  FOREIGN KEY(semana_id) REFERENCES escala_semanas(id), FOREIGN KEY(colaborador_folga_id) REFERENCES colaboradores(id),
  FOREIGN KEY(colaborador_fixo_id) REFERENCES colaboradores(id), FOREIGN KEY(parceiro_diogo_id) REFERENCES colaboradores(id)
);
CREATE TABLE IF NOT EXISTS escala_adicional_noturno (
  id INTEGER PRIMARY KEY AUTOINCREMENT, semana_id INTEGER NOT NULL, colaborador_id INTEGER NOT NULL,
  recebe_adicional INTEGER NOT NULL DEFAULT 1, periodo_inicio TEXT NOT NULL, periodo_fim TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'PREVISTO', atualizado_por INTEGER, atualizado_em TEXT,
  UNIQUE(semana_id,colaborador_id), FOREIGN KEY(semana_id) REFERENCES escala_semanas(id), FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id)
);
CREATE TABLE IF NOT EXISTS escala_alteracoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT, semana_id INTEGER NOT NULL, usuario_id INTEGER,
  escala_anterior TEXT NOT NULL, nova_escala TEXT NOT NULL, justificativa TEXT NOT NULL,
  alcance TEXT NOT NULL DEFAULT 'SEMANA', criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(semana_id) REFERENCES escala_semanas(id)
);
CREATE INDEX IF NOT EXISTS idx_escala_folgas_sabado_datas ON escala_folgas_sabado(data_sexta,data_sabado);
CREATE INDEX IF NOT EXISTS idx_escala_adicional_semana ON escala_adicional_noturno(semana_id,situacao);
CREATE INDEX IF NOT EXISTS idx_escala_alteracoes_semana ON escala_alteracoes_historico(semana_id,criado_em);

-- Desativação lógica: preserva todas as chaves e escalas históricas, mas impede
-- Rodolfo de ser oferecido para novas configurações do rodízio.
UPDATE colaboradores SET ativo=0 WHERE lower(trim(nome))='rodolfo';
