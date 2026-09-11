module.exports = ({ db, tableExists }) => {
  if (!tableExists('solicitacao_itens') || !tableExists('solicitacoes') || !tableExists('users')) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS solicitacao_item_alteracoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
      solicitacao_item_id INTEGER NOT NULL REFERENCES solicitacao_itens(id) ON DELETE CASCADE,
      solicitada_por_user_id INTEGER NOT NULL REFERENCES users(id),
      motivo TEXT NOT NULL,
      proposta_json TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDENTE',
      respondida_por_user_id INTEGER REFERENCES users(id),
      respondida_em TEXT,
      resposta_observacao TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sol_item_alteracoes_solicitacao
      ON solicitacao_item_alteracoes(solicitacao_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sol_item_alteracoes_item
      ON solicitacao_item_alteracoes(solicitacao_item_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sol_item_alteracao_pendente_unica
      ON solicitacao_item_alteracoes(solicitacao_item_id)
      WHERE status='PENDENTE';
  `);
};
