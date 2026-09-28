module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (!tableExists('estoque_itens') || !tableExists('estoque_movimentos')) return;

  [
    ['setor_utilizacao', "setor_utilizacao TEXT NOT NULL DEFAULT 'COMUM'"],
    ['subarea_centro_custo', 'subarea_centro_custo TEXT'],
    ['consumo_medio_mensal', 'consumo_medio_mensal REAL NOT NULL DEFAULT 0'],
    ['dias_cobertura_reposicao', 'dias_cobertura_reposicao REAL NOT NULL DEFAULT 0']
  ].forEach(([name, ddl]) => addColumnIfMissing('estoque_itens', name, ddl));

  [
    ['setor_utilizacao', 'setor_utilizacao TEXT'],
    ['subarea_centro_custo', 'subarea_centro_custo TEXT']
  ].forEach(([name, ddl]) => addColumnIfMissing('estoque_movimentos', name, ddl));

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_estoque_itens_setor_utilizacao
      ON estoque_itens(setor_utilizacao, ativo, nome);
    CREATE INDEX IF NOT EXISTS idx_estoque_itens_centro_custo
      ON estoque_itens(subarea_centro_custo, ativo);
    CREATE INDEX IF NOT EXISTS idx_estoque_mov_setor_data
      ON estoque_movimentos(setor_utilizacao, created_at, item_id);
  `);
};
