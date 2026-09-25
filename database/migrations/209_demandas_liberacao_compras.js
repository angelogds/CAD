module.exports = ({ db, tableExists, addColumnIfMissing }) => {
  if (!tableExists('demandas')) return;

  addColumnIfMissing('demandas', 'liberacao_compras_status', "liberacao_compras_status TEXT NOT NULL DEFAULT 'PENDENTE'");
  addColumnIfMissing('demandas', 'liberacao_compras_em', 'liberacao_compras_em TEXT');
  addColumnIfMissing('demandas', 'liberacao_compras_por', 'liberacao_compras_por INTEGER');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_demandas_liberacao_compras
      ON demandas(liberacao_compras_status);
  `);
};
