module.exports = ({ db, tableExists, addColumnIfMissing }) => {
  if (!tableExists('solicitacao_itens') || !tableExists('solicitacoes')) return;

  [
    ['origem_item', "origem_item TEXT NOT NULL DEFAULT 'SOLICITANTE'"],
    ['adicionado_por_user_id', 'adicionado_por_user_id INTEGER REFERENCES users(id)'],
    ['adicionado_em', 'adicionado_em TEXT'],
    ['adicao_justificativa', 'adicao_justificativa TEXT'],
    ['exclusao_status', "exclusao_status TEXT NOT NULL DEFAULT 'NENHUMA'"],
    ['exclusao_solicitada_por_user_id', 'exclusao_solicitada_por_user_id INTEGER REFERENCES users(id)'],
    ['exclusao_solicitada_em', 'exclusao_solicitada_em TEXT'],
    ['exclusao_motivo', 'exclusao_motivo TEXT'],
    ['exclusao_respondida_por_user_id', 'exclusao_respondida_por_user_id INTEGER REFERENCES users(id)'],
    ['exclusao_respondida_em', 'exclusao_respondida_em TEXT'],
    ['exclusao_resposta_observacao', 'exclusao_resposta_observacao TEXT'],
  ].forEach(([name, ddl]) => addColumnIfMissing('solicitacao_itens', name, ddl));

  db.exec(`
    CREATE TABLE IF NOT EXISTS solicitacao_item_exclusoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id),
      solicitacao_item_id INTEGER NOT NULL REFERENCES solicitacao_itens(id),
      solicitada_por_user_id INTEGER NOT NULL REFERENCES users(id),
      motivo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDENTE',
      snapshot_json TEXT,
      respondida_por_user_id INTEGER REFERENCES users(id),
      respondida_em TEXT,
      resposta_observacao TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sol_item_exclusoes_solicitacao
      ON solicitacao_item_exclusoes(solicitacao_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sol_item_exclusoes_item
      ON solicitacao_item_exclusoes(solicitacao_item_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sol_item_exclusao_pendente_unica
      ON solicitacao_item_exclusoes(solicitacao_item_id)
      WHERE status='PENDENTE';
  `);
};
