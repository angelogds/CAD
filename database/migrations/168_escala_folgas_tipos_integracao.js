module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  if (!tableExists('escala_folgas_programadas')) return;
  const columns = [
    ['tipo_lancamento', "tipo_lancamento TEXT NOT NULL DEFAULT 'FOLGA_COMPENSATORIA'"],
    ['data_fim', 'data_fim TEXT'], ['data_servico', 'data_servico TEXT'],
    ['hora_inicio', 'hora_inicio TEXT'], ['hora_fim', 'hora_fim TEXT'],
    ['equipamento', 'equipamento TEXT'], ['descricao_servico', 'descricao_servico TEXT'],
    ['anexo_path', 'anexo_path TEXT'], ['debita_banco', 'debita_banco INTEGER NOT NULL DEFAULT 1'],
    ['saldo_antes_minutos', 'saldo_antes_minutos INTEGER'], ['saldo_depois_minutos', 'saldo_depois_minutos INTEGER'],
    ['concessao_id', 'concessao_id INTEGER'], ['ausencia_id', 'ausencia_id INTEGER'],
    ['realizado_em', 'realizado_em TEXT'], ['estornado_em', 'estornado_em TEXT'],
    ['justificativa_saldo_negativo', 'justificativa_saldo_negativo TEXT'],
  ];
  for (const [name, ddl] of columns) addColumnIfMissing('escala_folgas_programadas', name, ddl);
  db.exec(`UPDATE escala_folgas_programadas SET data_fim=COALESCE(data_fim,data_folga),
    tipo_lancamento=COALESCE(NULLIF(tipo_lancamento,''),'FOLGA_COMPENSATORIA'),
    debita_banco=COALESCE(debita_banco,1) WHERE data_fim IS NULL OR tipo_lancamento IS NULL;
    CREATE INDEX IF NOT EXISTS idx_escala_folgas_periodo ON escala_folgas_programadas(data_folga,data_fim);
    CREATE INDEX IF NOT EXISTS idx_escala_folgas_tipo ON escala_folgas_programadas(tipo_lancamento);`);

  // A tabela histórica tinha CHECK limitado a folga/atestado. A nova origem fica
  // registrada em folgas_programadas; esta coluna permite espelhar todos os tipos.
  if (tableExists('escala_ausencias') && !columnExists('escala_ausencias', 'tipo_lancamento')) {
    addColumnIfMissing('escala_ausencias', 'tipo_lancamento', 'tipo_lancamento TEXT');
  }
};
