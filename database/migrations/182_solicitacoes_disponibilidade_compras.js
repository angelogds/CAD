module.exports.up = ({ db, tableExists, addColumnIfMissing }) => {
  if (!tableExists('solicitacoes')) return;
  addColumnIfMissing('solicitacoes', 'disponivel_compras', 'disponivel_compras INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('solicitacoes', 'disponivel_compras_em', 'disponivel_compras_em TEXT');
  addColumnIfMissing('solicitacoes', 'disponivel_compras_por', 'disponivel_compras_por INTEGER REFERENCES users(id)');
  addColumnIfMissing('solicitacoes', 'elaboracao_finalizada_em', 'elaboracao_finalizada_em TEXT');
  addColumnIfMissing('solicitacoes', 'elaboracao_finalizada_por', 'elaboracao_finalizada_por INTEGER REFERENCES users(id)');

  // Registros que já avançaram no fluxo permanecem visíveis, sem alterar seu status.
  db.exec(`
    UPDATE solicitacoes SET disponivel_compras=1,
      disponivel_compras_em=COALESCE(disponivel_compras_em,cotacao_inicio_em,updated_at,created_at)
    WHERE status NOT IN ('ABERTA','REABERTA','DEVOLVIDA_REVISAO','CANCELADA')
      AND COALESCE(disponivel_compras,0)=0;
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_disponivel_compras ON solicitacoes(disponivel_compras, status);
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_prioridade_prazo ON solicitacoes(prioridade, previsao_entrega, created_at);
  `);
};
