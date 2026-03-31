module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  if (tableExists('os')) {
    addColumnIfMissing('os', 'origem', "origem TEXT NOT NULL DEFAULT 'MANUAL'");
    addColumnIfMissing('os', 'regra_geradora_id', 'regra_geradora_id INTEGER');
    addColumnIfMissing('os', 'preventiva_execucao_id', 'preventiva_execucao_id INTEGER');
    addColumnIfMissing('os', 'risco_score_snapshot', 'risco_score_snapshot INTEGER');
    addColumnIfMissing('os', 'metadata_automacao_json', 'metadata_automacao_json TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS regras_automacao_os (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      gatilho TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      configuracao_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_regras_auto_ativo ON regras_automacao_os(ativo, gatilho);

    CREATE TABLE IF NOT EXISTS alertas_operacionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      severidade TEXT NOT NULL DEFAULT 'MEDIA',
      entidade_tipo TEXT,
      entidade_id INTEGER,
      responsavel_user_id INTEGER,
      mensagem TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NAO_LIDO',
      metadata_json TEXT,
      regra_geradora_id INTEGER,
      chave_unica TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      lido_em TEXT,
      FOREIGN KEY(responsavel_user_id) REFERENCES users(id),
      FOREIGN KEY(regra_geradora_id) REFERENCES regras_automacao_os(id)
    );

    CREATE INDEX IF NOT EXISTS idx_alertas_operacionais_status ON alertas_operacionais(status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_operacionais_chave ON alertas_operacionais(chave_unica) WHERE chave_unica IS NOT NULL;

    CREATE TABLE IF NOT EXISTS equipamento_risco_scores (
      equipamento_id INTEGER PRIMARY KEY,
      score_risco INTEGER NOT NULL DEFAULT 0,
      classificacao_risco TEXT NOT NULL DEFAULT 'BAIXO',
      falhas_180d INTEGER NOT NULL DEFAULT 0,
      reincidencia INTEGER NOT NULL DEFAULT 0,
      custo_acumulado REAL NOT NULL DEFAULT 0,
      dias_sem_manutencao INTEGER NOT NULL DEFAULT 0,
      preventivas_atrasadas INTEGER NOT NULL DEFAULT 0,
      criticidade_base TEXT,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_risco_score_classificacao ON equipamento_risco_scores(classificacao_risco, score_risco DESC);
    CREATE INDEX IF NOT EXISTS idx_os_origem_regra ON os(origem, regra_geradora_id, status);
  `);

  if (tableExists('os') && columnExists('os', 'origem')) {
    db.exec("UPDATE os SET origem = COALESCE(NULLIF(UPPER(origem),''), 'MANUAL')");
  }
};
