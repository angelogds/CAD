// Classificação complementar e não destrutiva. Cadastros existentes mantêm seus IDs.
module.exports = function up({ db }) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estoque_categorias'").get();
  if (!exists) return;
  const raiz = db.prepare("SELECT id FROM estoque_categorias WHERE UPPER(TRIM(nome))=UPPER(TRIM(?)) AND parent_id IS NULL ORDER BY id LIMIT 1");
  const filho = db.prepare("SELECT id FROM estoque_categorias WHERE UPPER(TRIM(nome))=UPPER(TRIM(?)) AND parent_id=? ORDER BY id LIMIT 1");
  const insert = db.prepare("INSERT INTO estoque_categorias(nome,parent_id,ativo) VALUES(?,?,1)");
  const arvore = {
    SOLDAS: ['Eletrodos revestidos','Arame MIG sólido','Arame MIG tubular','TIG e varetas'],
    ABRASIVOS: ['Discos de corte','Discos de desbaste','Discos flap'],
    PINTURA: ['Tintas','Solventes','Pincéis e acessórios'],
    LUBRIFICANTES: ['Graxas EP2','Óleos industriais','Lubrificantes especiais']
  };
  db.transaction(() => {
    for (const [nome, subcategorias] of Object.entries(arvore)) {
      let cat = raiz.get(nome);
      if (!cat) cat = { id: Number(insert.run(nome,null).lastInsertRowid) };
      for (const sub of subcategorias) if (!filho.get(sub,cat.id)) insert.run(sub,cat.id);
    }
  })();
  // Sem mover itens por semelhança de texto: a subcategoria precisa de conferência física.
};
