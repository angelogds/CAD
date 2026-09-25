module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (!tableExists('pcm_lubrificacao_planos')) return;

  addColumnIfMissing('pcm_lubrificacao_planos', 'metodo_aplicacao', 'metodo_aplicacao TEXT');
  addColumnIfMissing('pcm_lubrificacao_planos', 'responsavel_user_id', 'responsavel_user_id INTEGER');
  addColumnIfMissing('pcm_lubrificacao_planos', 'estoque_item_id', 'estoque_item_id INTEGER');
  addColumnIfMissing('pcm_lubrificacao_planos', 'ativo', 'ativo INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('pcm_lubrificacao_planos', 'ultima_execucao_em', 'ultima_execucao_em TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS pcm_lubrificacao_execucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plano_id INTEGER NOT NULL,
      equipamento_id INTEGER NOT NULL,
      executor_user_id INTEGER NOT NULL,
      quantidade_prevista REAL,
      quantidade_utilizada REAL,
      unidade TEXT,
      observacao TEXT,
      anomalia INTEGER NOT NULL DEFAULT 0,
      anomalia_descricao TEXT,
      proxima_execucao_em TEXT,
      executed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(plano_id) REFERENCES pcm_lubrificacao_planos(id),
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id),
      FOREIGN KEY(executor_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pcm_lubrificacao_responsavel
      ON pcm_lubrificacao_planos(responsavel_user_id, ativo, proxima_execucao_em);

    CREATE INDEX IF NOT EXISTS idx_pcm_lubrificacao_execucoes_plano
      ON pcm_lubrificacao_execucoes(plano_id, executed_at);

    CREATE INDEX IF NOT EXISTS idx_pcm_lubrificacao_execucoes_executor
      ON pcm_lubrificacao_execucoes(executor_user_id, executed_at);
  `);
};
