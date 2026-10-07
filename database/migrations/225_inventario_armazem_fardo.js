module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  function hasColumn(table, name) {
    try {
      return db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
    } catch {
      return false;
    }
  }

  if (tableExists('estoque_locais') && hasColumn('estoque_locais', 'nome')) {
    const existing = db.prepare(`
      SELECT id FROM estoque_locais
      WHERE UPPER(TRIM(nome))='ARMAZÉM FARDO'
         OR UPPER(TRIM(nome))='ARMAZEM FARDO'
      LIMIT 1
    `).get();

    if (!existing) {
      const cols = ['nome'];
      const values = ['ARMAZÉM FARDO'];
      if (hasColumn('estoque_locais', 'descricao')) {
        cols.push('descricao');
        values.push('Estoque físico de materiais de manutenção no Armazém Fardo');
      }
      if (hasColumn('estoque_locais', 'ativo')) {
        cols.push('ativo');
        values.push(1);
      }
      db.prepare(`INSERT INTO estoque_locais (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...values);
    }
  }

  if (!tableExists('estoque_categorias') || !hasColumn('estoque_categorias', 'nome')) return;

  if (!hasColumn('estoque_categorias', 'parent_id')) {
    addColumnIfMissing('estoque_categorias', 'parent_id', 'parent_id INTEGER REFERENCES estoque_categorias(id)');
  }

  const ativo = hasColumn('estoque_categorias', 'ativo');
  const ensureCategory = (nome, parentId = null) => {
    const row = db.prepare(`
      SELECT id FROM estoque_categorias
      WHERE UPPER(TRIM(nome))=UPPER(TRIM(?))
        AND COALESCE(parent_id,0)=COALESCE(?,0)
      LIMIT 1
    `).get(nome, parentId);
    if (row?.id) return Number(row.id);

    const info = ativo
      ? db.prepare('INSERT INTO estoque_categorias (nome,parent_id,ativo) VALUES (?,?,1)').run(nome, parentId)
      : db.prepare('INSERT INTO estoque_categorias (nome,parent_id) VALUES (?,?)').run(nome, parentId);
    return Number(info.lastInsertRowid);
  };

  const soldagem = ensureCategory('SOLDAGEM');
  const corte = ensureCategory('BROCAS E FERRAMENTAS DE CORTE');
  const fixacao = ensureCategory('FIXAÇÃO');
  const tintas = ensureCategory('TINTAS E QUÍMICOS');

  ['ELETRODOS','ARAMES MIG / TUBULAR','VARETAS TIG','CONSUMÍVEIS DE SOLDA']
    .forEach((nome) => ensureCategory(nome, soldagem));
  ['DISCOS DE CORTE','DISCOS DE DESBASTE','DISCOS FLAP']
    .forEach((nome) => ensureCategory(nome, corte));
  ['PARAFUSOS','PORCAS','ARRUELAS','PRISIONEIROS']
    .forEach((nome) => ensureCategory(nome, fixacao));
  ['TINTAS','SOLVENTES E DILUENTES','SPRAYS E QUÍMICOS']
    .forEach((nome) => ensureCategory(nome, tintas));
};
