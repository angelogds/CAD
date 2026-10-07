module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  function hasColumn(table, name) {
    try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
  }

  if (tableExists('estoque_categorias')) {
    addColumnIfMissing('estoque_categorias', 'parent_id', 'parent_id INTEGER REFERENCES estoque_categorias(id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_categorias_parent ON estoque_categorias(parent_id, ativo, nome);');
  }

  if (tableExists('estoque_itens')) {
    addColumnIfMissing('estoque_itens', 'subcategoria_id', 'subcategoria_id INTEGER REFERENCES estoque_categorias(id)');
    addColumnIfMissing('estoque_itens', 'endereco_zona', 'endereco_zona TEXT');
    addColumnIfMissing('estoque_itens', 'endereco_estante', 'endereco_estante TEXT');
    addColumnIfMissing('estoque_itens', 'endereco_prateleira', 'endereco_prateleira TEXT');
    addColumnIfMissing('estoque_itens', 'endereco_posicao', 'endereco_posicao TEXT');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_estoque_itens_subcategoria ON estoque_itens(subcategoria_id, ativo, nome);
      CREATE INDEX IF NOT EXISTS idx_estoque_itens_endereco ON estoque_itens(endereco_zona,endereco_estante,endereco_prateleira,endereco_posicao);
    `);
  }

  if (tableExists('preventiva_planos')) {
    addColumnIfMissing('preventiva_planos', 'estoque_item_id', 'estoque_item_id INTEGER REFERENCES estoque_itens(id)');
    addColumnIfMissing('preventiva_planos', 'quantidade_material', 'quantidade_material REAL');
    addColumnIfMissing('preventiva_planos', 'estoque_minimo_conjuntos', 'estoque_minimo_conjuntos REAL NOT NULL DEFAULT 1');
    addColumnIfMissing('preventiva_planos', 'baixa_estoque_automatica', 'baixa_estoque_automatica INTEGER NOT NULL DEFAULT 0');
    db.exec('CREATE INDEX IF NOT EXISTS idx_prev_planos_material ON preventiva_planos(estoque_item_id,tipo_plano,ativo);');
  }

  if (tableExists('preventiva_execucoes')) {
    addColumnIfMissing('preventiva_execucoes', 'estoque_movimento_id', 'estoque_movimento_id INTEGER REFERENCES estoque_movimentos(id)');
    addColumnIfMissing('preventiva_execucoes', 'estoque_quantidade_utilizada', 'estoque_quantidade_utilizada REAL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_prev_exec_estoque_mov ON preventiva_execucoes(estoque_movimento_id);');
  }

  if (!tableExists('estoque_categorias') || !hasColumn('estoque_categorias', 'nome')) return;

  const ativoColumn = hasColumn('estoque_categorias', 'ativo');
  const ensureCategory = (nome, parentId = null) => {
    const existing = db.prepare(`
      SELECT id FROM estoque_categorias
      WHERE UPPER(TRIM(nome))=UPPER(TRIM(?))
        AND COALESCE(parent_id,0)=COALESCE(?,0)
      LIMIT 1
    `).get(nome, parentId);
    if (existing?.id) return Number(existing.id);
    const info = ativoColumn
      ? db.prepare('INSERT INTO estoque_categorias (nome,parent_id,ativo) VALUES (?,?,1)').run(nome, parentId)
      : db.prepare('INSERT INTO estoque_categorias (nome,parent_id) VALUES (?,?)').run(nome, parentId);
    return Number(info.lastInsertRowid);
  };

  const rolamentos = ensureCategory('ROLAMENTOS');
  const correias = ensureCategory('CORREIAS');

  [
    'SÉRIE 22','SÉRIE 23','SÉRIE 30','SÉRIE 31','SÉRIE 32',
    'SÉRIE 62','SÉRIE 63','MANCAIS E BUCHAS','OUTROS ROLAMENTOS'
  ].forEach((nome) => ensureCategory(nome, rolamentos));

  [
    'PERFIL A','PERFIL B','PERFIL C','3VX','SPZ','SPA','SPB','SPC',
    'DENTADAS','POLY-V','OUTRAS CORREIAS'
  ].forEach((nome) => ensureCategory(nome, correias));
};
