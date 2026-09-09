module.exports = ({ db, tableExists, addColumnIfMissing }) => {
  if (!tableExists('solicitacao_itens')) return;

  addColumnIfMissing('solicitacao_itens', 'aprovacao_item_status', "aprovacao_item_status TEXT NOT NULL DEFAULT 'NAO_SOLICITADA'");
  addColumnIfMissing('solicitacao_itens', 'aprovacao_item_por_user_id', 'aprovacao_item_por_user_id INTEGER');
  addColumnIfMissing('solicitacao_itens', 'aprovacao_item_em', 'aprovacao_item_em TEXT');
  addColumnIfMissing('solicitacao_itens', 'aprovacao_item_assinatura', 'aprovacao_item_assinatura TEXT');
  addColumnIfMissing('solicitacao_itens', 'aprovacao_item_valor_centavos', 'aprovacao_item_valor_centavos INTEGER');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_aprovacao_item
      ON solicitacao_itens(solicitacao_id, aprovacao_item_status);

    CREATE TABLE IF NOT EXISTS compras_aprovacoes_itens_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER NOT NULL,
      solicitacao_item_id INTEGER NOT NULL,
      acao TEXT NOT NULL,
      executado_por_user_id INTEGER,
      valor_centavos INTEGER,
      cotacao_assinatura TEXT,
      observacao TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_compras_aprovacoes_itens_sol
      ON compras_aprovacoes_itens_historico(solicitacao_id, solicitacao_item_id, id);
  `);
};
