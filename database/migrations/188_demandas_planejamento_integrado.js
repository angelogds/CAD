module.exports = ({ db, tableExists, columnExists, addColumnIfMissing }) => {
  if (!tableExists('demandas')) return;

  addColumnIfMissing('demandas', 'demanda_pai_id', 'demanda_pai_id INTEGER');
  addColumnIfMissing('demandas', 'equipamento_id', 'equipamento_id INTEGER');
  addColumnIfMissing('demandas', 'categoria', "categoria TEXT NOT NULL DEFAULT 'MANUTENCAO'");
  addColumnIfMissing('demandas', 'setor_origem', 'setor_origem TEXT');
  addColumnIfMissing('demandas', 'nr_referencia', 'nr_referencia TEXT');
  addColumnIfMissing('demandas', 'prazo_previsto', 'prazo_previsto TEXT');
  addColumnIfMissing('demandas', 'custo_servicos_estimado', 'custo_servicos_estimado REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('demandas', 'aprovacao_status', "aprovacao_status TEXT NOT NULL DEFAULT 'PENDENTE'");

  if (tableExists('os')) {
    addColumnIfMissing('os', 'demanda_id', 'demanda_id INTEGER');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_demandas_pai ON demandas(demanda_pai_id);
    CREATE INDEX IF NOT EXISTS idx_demandas_equipamento ON demandas(equipamento_id);
    CREATE INDEX IF NOT EXISTS idx_demandas_categoria ON demandas(categoria);
  `);

  if (tableExists('os') && columnExists('os', 'demanda_id')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_os_demanda_id ON os(demanda_id);');
  }
};
