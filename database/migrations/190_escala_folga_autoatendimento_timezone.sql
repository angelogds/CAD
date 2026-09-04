PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS escala_folga_solicitacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  colaborador_id INTEGER NOT NULL,
  data_folga TEXT NOT NULL,
  minutos_solicitados INTEGER NOT NULL DEFAULT 480,
  motivo TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE_APROVACAO'
    CHECK (status IN ('PENDENTE_APROVACAO','APROVADA','REPROVADA','CANCELADA')),
  folga_id INTEGER,
  solicitado_em TEXT NOT NULL DEFAULT (datetime('now')),
  decidido_por INTEGER,
  decidido_em TEXT,
  observacao_decisao TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id),
  FOREIGN KEY(folga_id) REFERENCES escala_folgas_programadas(id),
  FOREIGN KEY(decidido_por) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_escala_folga_solic_colaborador
  ON escala_folga_solicitacoes(colaborador_id, status, data_folga);
CREATE INDEX IF NOT EXISTS idx_escala_folga_solic_status_data
  ON escala_folga_solicitacoes(status, data_folga);

-- Uma solicitação pendente reserva a data para toda a equipe.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_escala_folga_solic_data_pendente
  ON escala_folga_solicitacoes(data_folga)
  WHERE status = 'PENDENTE_APROVACAO';

-- Corrige a data operacional das horas extras para Brasília sem alterar
-- os timestamps UTC armazenados. Em 2026, Brasília opera em UTC-3.
UPDATE escala_horas_extras
SET data_servico = date(inicio_extra, '-3 hours')
WHERE inicio_extra IS NOT NULL
  AND date(inicio_extra, '-3 hours') IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_escala_he_data_brasilia_insert
AFTER INSERT ON escala_horas_extras
WHEN NEW.inicio_extra IS NOT NULL
BEGIN
  UPDATE escala_horas_extras
  SET data_servico = date(NEW.inicio_extra, '-3 hours')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_escala_he_data_brasilia_update
AFTER UPDATE OF inicio_extra ON escala_horas_extras
WHEN NEW.inicio_extra IS NOT NULL
BEGIN
  UPDATE escala_horas_extras
  SET data_servico = date(NEW.inicio_extra, '-3 hours')
  WHERE id = NEW.id;
END;
