-- Solicitações podem concorrer à mesma data; somente a aprovação autoriza folga adicional.
-- A antiga UNIQUE impedia até o pedido de exceção.
DROP INDEX IF EXISTS uidx_escala_folga_solic_data_pendente;

CREATE INDEX IF NOT EXISTS idx_escala_folga_solic_pendentes_data
  ON escala_folga_solicitacoes(data_folga, status)
  WHERE status = 'PENDENTE_APROVACAO';

ALTER TABLE escala_folga_solicitacoes ADD COLUMN exige_excecao INTEGER NOT NULL DEFAULT 0;
ALTER TABLE escala_folga_solicitacoes ADD COLUMN excecao_autorizada_por INTEGER REFERENCES users(id);
ALTER TABLE escala_folga_solicitacoes ADD COLUMN justificativa_excecao TEXT;
ALTER TABLE escala_folga_solicitacoes ADD COLUMN excecao_autorizada_em TEXT;
