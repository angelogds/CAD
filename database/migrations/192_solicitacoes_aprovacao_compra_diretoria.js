module.exports = ({ db, tableExists, columnExists, addColumnIfMissing }) => {
  if (!tableExists('solicitacoes')) return;

  addColumnIfMissing('solicitacoes', 'diretor_aprovador_user_id', 'diretor_aprovador_user_id INTEGER');
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_status', "aprovacao_compra_status TEXT NOT NULL DEFAULT 'NAO_SOLICITADA'");
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_solicitada_em', 'aprovacao_compra_solicitada_em TEXT');
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_solicitada_por', 'aprovacao_compra_solicitada_por INTEGER');
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_em', 'aprovacao_compra_em TEXT');
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_por', 'aprovacao_compra_por INTEGER');
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_metodo', 'aprovacao_compra_metodo TEXT');
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_observacao', 'aprovacao_compra_observacao TEXT');
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_reprovada_em', 'aprovacao_compra_reprovada_em TEXT');
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_reprovada_por', 'aprovacao_compra_reprovada_por INTEGER');
  addColumnIfMissing('solicitacoes', 'aprovacao_compra_reprovacao_motivo', 'aprovacao_compra_reprovacao_motivo TEXT');
  addColumnIfMissing('solicitacoes', 'aprovacao_valor_cotado_centavos', 'aprovacao_valor_cotado_centavos INTEGER');
  addColumnIfMissing('solicitacoes', 'aprovacao_cotacao_assinatura', 'aprovacao_cotacao_assinatura TEXT');
  addColumnIfMissing('solicitacoes', 'aprovacao_manual_registrada_por', 'aprovacao_manual_registrada_por INTEGER');
  addColumnIfMissing('solicitacoes', 'aprovacao_evidencia_anexo_id', 'aprovacao_evidencia_anexo_id INTEGER');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_aprovacao_compra_status
      ON solicitacoes(aprovacao_compra_status);
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_diretor_aprovador
      ON solicitacoes(diretor_aprovador_user_id);

    CREATE TABLE IF NOT EXISTS compras_aprovacoes_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER NOT NULL,
      acao TEXT NOT NULL,
      diretor_user_id INTEGER,
      executado_por_user_id INTEGER,
      valor_cotado_centavos INTEGER,
      cotacao_assinatura TEXT,
      metodo TEXT,
      observacao TEXT,
      evidencia_anexo_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_compras_aprovacoes_solicitacao
      ON compras_aprovacoes_historico(solicitacao_id, id);
    CREATE INDEX IF NOT EXISTS idx_compras_aprovacoes_diretor
      ON compras_aprovacoes_historico(diretor_user_id, id);
  `);

  if (tableExists('compras_aprovacoes_historico')) {
    addColumnIfMissing('compras_aprovacoes_historico', 'cotacao_assinatura', 'cotacao_assinatura TEXT');
    addColumnIfMissing('compras_aprovacoes_historico', 'evidencia_anexo_id', 'evidencia_anexo_id INTEGER');
  }
};
