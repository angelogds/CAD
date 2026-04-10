module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (tableExists('os')) {
    addColumnIfMissing('os', 'ai_analise_completa', 'ai_analise_completa TEXT');
    addColumnIfMissing('os', 'ai_acoes_recomendadas', 'ai_acoes_recomendadas TEXT');
    addColumnIfMissing('os', 'ai_pecas_possiveis', 'ai_pecas_possiveis TEXT');
    addColumnIfMissing('os', 'ai_ferramentas_necessarias', 'ai_ferramentas_necessarias TEXT');
    addColumnIfMissing('os', 'ai_tempo_estimado_horas', 'ai_tempo_estimado_horas REAL');
    addColumnIfMissing('os', 'ai_referencias_tecnicas', 'ai_referencias_tecnicas TEXT');
    addColumnIfMissing('os', 'ai_ultima_analise_em', 'ai_ultima_analise_em DATETIME');
    addColumnIfMissing('os', 'ai_modelo_usado', 'ai_modelo_usado TEXT');
    addColumnIfMissing('os', 'ai_tokens_utilizados', 'ai_tokens_utilizados INTEGER');
  }

  if (tableExists('preventiva_execucoes')) {
    addColumnIfMissing('preventiva_execucoes', 'ai_analise', 'ai_analise TEXT');
    addColumnIfMissing('preventiva_execucoes', 'ai_pontos_atencao', 'ai_pontos_atencao TEXT');
    addColumnIfMissing('preventiva_execucoes', 'ai_recomendacoes', 'ai_recomendacoes TEXT');
    addColumnIfMissing('preventiva_execucoes', 'ai_ajustes_sugeridos', 'ai_ajustes_sugeridos TEXT');
    addColumnIfMissing('preventiva_execucoes', 'ai_risco_falha', 'ai_risco_falha TEXT');
  }

  if (tableExists('equipamentos')) {
    addColumnIfMissing('equipamentos', 'ai_saude_indicada', 'ai_saude_indicada TEXT');
    addColumnIfMissing('equipamentos', 'ai_ultima_avaliacao', 'ai_ultima_avaliacao DATETIME');
    addColumnIfMissing('equipamentos', 'ai_recomendacoes', 'ai_recomendacoes TEXT');
    addColumnIfMissing('equipamentos', 'ai_risco_operacional', 'ai_risco_operacional TEXT');
    addColumnIfMissing('equipamentos', 'ai_proxima_manutencao_sugerida', 'ai_proxima_manutencao_sugerida DATETIME');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_embeddings_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entidade_tipo TEXT NOT NULL,
      entidade_id INTEGER NOT NULL,
      texto_base TEXT,
      metadata_json TEXT,
      vetor_json TEXT NOT NULL,
      modelo TEXT,
      atualizado_em DATETIME NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entidade_tipo, entidade_id)
    );

    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      user_id INTEGER,
      context_json TEXT,
      message TEXT NOT NULL,
      response TEXT,
      model TEXT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_image_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER,
      equipamento_id INTEGER,
      tipo_analise TEXT NOT NULL,
      resultado_json TEXT NOT NULL,
      gravidade TEXT,
      componentes_json TEXT,
      modelo TEXT,
      criado_em DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      referencia_tipo TEXT,
      referencia_id INTEGER,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      erro_tecnico TEXT,
      criado_em DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ai_embeddings_index_lookup ON ai_embeddings_index(entidade_tipo, entidade_id);
    CREATE INDEX IF NOT EXISTS idx_ai_embeddings_index_updated ON ai_embeddings_index(atualizado_em DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_conversation ON ai_conversations(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_image_analyses_os ON ai_image_analyses(os_id, criado_em DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_image_analyses_equipamento ON ai_image_analyses(equipamento_id, criado_em DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tipo_data ON ai_usage_logs(tipo, criado_em DESC);
  `);
};
