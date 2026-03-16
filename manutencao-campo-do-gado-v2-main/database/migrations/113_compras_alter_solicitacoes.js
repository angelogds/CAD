module.exports = ({ db, tableExists, columnExists }) => {
  if (!tableExists('solicitacoes')) return;

  const ensureColumn = (name, definition) => {
    if (!columnExists('solicitacoes', name)) {
      db.exec(`ALTER TABLE solicitacoes ADD COLUMN ${name} ${definition};`);
    }
  };

  ensureColumn('compras_user_id', 'INTEGER');
  ensureColumn('cotacao_inicio_em', 'DATETIME');
  ensureColumn('comprada_em', 'DATETIME');
  ensureColumn('fornecedor', 'TEXT');
  ensureColumn('previsao_entrega', 'TEXT');
  ensureColumn('valor_total', 'REAL');
  ensureColumn('observacoes_compras', 'TEXT');

  ensureColumn('status', "TEXT NOT NULL DEFAULT 'ABERTA'");
  ensureColumn('numero', 'TEXT');
};
