module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (!tableExists('solicitacoes') || !tableExists('solicitacao_itens')) return;

  [
    ['pre_status', "pre_status TEXT"],
    ['semana_referencia', 'semana_referencia TEXT'],
    ['subarea_destino', 'subarea_destino TEXT'],
    ['pre_criada_por_user_id', 'pre_criada_por_user_id INTEGER REFERENCES users(id)'],
    ['pre_enviada_aprovacao_em', 'pre_enviada_aprovacao_em TEXT'],
    ['pre_aprovador_user_id', 'pre_aprovador_user_id INTEGER REFERENCES users(id)'],
    ['pre_aprovada_em', 'pre_aprovada_em TEXT'],
    ['pre_observacao_aprovacao', 'pre_observacao_aprovacao TEXT'],
  ].forEach(([name, ddl]) => addColumnIfMissing('solicitacoes', name, ddl));

  [
    ['qtd_sugerida_almox', 'qtd_sugerida_almox REAL'],
    ['qtd_aprovada_setor', 'qtd_aprovada_setor REAL'],
    ['pre_aprovacao_item_status', "pre_aprovacao_item_status TEXT"],
    ['pre_aprovacao_item_por', 'pre_aprovacao_item_por INTEGER REFERENCES users(id)'],
    ['pre_aprovacao_item_em', 'pre_aprovacao_item_em TEXT'],
    ['pre_aprovacao_item_observacao', 'pre_aprovacao_item_observacao TEXT'],
  ].forEach(([name, ddl]) => addColumnIfMissing('solicitacao_itens', name, ddl));

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_pre_status
      ON solicitacoes(tipo_origem, pre_status, setor_origem, created_at);

    CREATE INDEX IF NOT EXISTS idx_solicitacoes_pre_aprovador
      ON solicitacoes(pre_aprovador_user_id, pre_status);

    CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_pre_status
      ON solicitacao_itens(solicitacao_id, pre_aprovacao_item_status);
  `);
};
