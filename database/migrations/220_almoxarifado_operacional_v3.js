module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  function hasColumn(table, name) {
    try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
  }

  if (tableExists('estoque_itens')) {
    addColumnIfMissing('estoque_itens', 'equipamento_id', 'equipamento_id INTEGER REFERENCES equipamentos(id)');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_estoque_itens_equipamento
        ON estoque_itens(equipamento_id, ativo, nome);
    `);
  }

  if (tableExists('estoque_categorias') && hasColumn('estoque_categorias', 'nome')) {
    const categorias = [
      'ROLAMENTOS',
      'CORREIAS',
      'SOLDAGEM',
      'BROCAS E FERRAMENTAS DE CORTE',
      'MATERIAL DE MANUTENÇÃO',
      'FIXAÇÃO',
      'LUBRIFICAÇÃO',
      'ELÉTRICA',
      'HIDRÁULICA E PNEUMÁTICA',
      'PEÇAS DE EQUIPAMENTOS',
      'DIVERSOS'
    ];
    const ativoColumn = hasColumn('estoque_categorias', 'ativo');
    const insert = ativoColumn
      ? db.prepare('INSERT INTO estoque_categorias (nome,ativo) VALUES (?,1)')
      : db.prepare('INSERT INTO estoque_categorias (nome) VALUES (?)');
    const exists = db.prepare('SELECT id FROM estoque_categorias WHERE UPPER(TRIM(nome))=UPPER(TRIM(?)) LIMIT 1');
    for (const nome of categorias) {
      if (!exists.get(nome)) insert.run(nome);
    }
  }
};
