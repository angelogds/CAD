module.exports.up = ({ db, tableExists, addColumnIfMissing }) => {
  if (!tableExists('solicitacoes') || !tableExists('solicitacao_itens')) return;

  [
    ['frete_centavos', 'frete_centavos INTEGER NOT NULL DEFAULT 0'],
    ['desconto_centavos', 'desconto_centavos INTEGER NOT NULL DEFAULT 0'],
    ['condicao_pagamento', 'condicao_pagamento TEXT'],
    ['validade_cotacao', 'validade_cotacao TEXT'],
    ['numero_pedido', 'numero_pedido TEXT'],
    ['numero_nota_fiscal', 'numero_nota_fiscal TEXT'],
    ['valores_itens_revisados', 'valores_itens_revisados INTEGER NOT NULL DEFAULT 0'],
  ].forEach(([name, ddl]) => addColumnIfMissing('solicitacoes', name, ddl));

  [
    ['fornecedor_id', 'fornecedor_id INTEGER REFERENCES fornecedores(id)'],
    ['valor_unitario_centavos', 'valor_unitario_centavos INTEGER'],
    ['status_cotacao', "status_cotacao TEXT NOT NULL DEFAULT 'PENDENTE'"],
    ['status_compra', "status_compra TEXT NOT NULL DEFAULT 'PENDENTE'"],
    ['qtd_comprada', 'qtd_comprada REAL'],
    ['cotado_em', 'cotado_em TEXT'],
    ['comprado_em', 'comprado_em TEXT'],
    ['recebido_em', 'recebido_em TEXT'],
    ['atualizado_por', 'atualizado_por INTEGER REFERENCES users(id)'],
  ].forEach(([name, ddl]) => addColumnIfMissing('solicitacao_itens', name, ddl));

  db.exec(`
    CREATE TABLE IF NOT EXISTS compras_recebimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
      solicitacao_item_id INTEGER NOT NULL REFERENCES solicitacao_itens(id) ON DELETE CASCADE,
      quantidade REAL NOT NULL CHECK (quantidade > 0),
      usuario_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_compras_recebimentos_item ON compras_recebimentos(solicitacao_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_compras_item_fornecedor ON solicitacao_itens(fornecedor_id);

    CREATE VIEW IF NOT EXISTS vw_compras_custos_os AS
      SELECT s.os_id, s.equipamento_id, s.id AS solicitacao_id,
        SUM(CASE WHEN si.status_cotacao='COTADO' THEN si.qtd_solicitada * si.valor_unitario_centavos ELSE 0 END) AS cotado_centavos,
        SUM(CASE WHEN si.status_compra='COMPRADO' THEN COALESCE(si.qtd_comprada,si.qtd_solicitada) * si.valor_unitario_centavos ELSE 0 END) AS comprometido_centavos,
        SUM(COALESCE(si.qtd_recebida_total,0) * COALESCE(si.valor_unitario_centavos,0)) AS recebido_centavos
      FROM solicitacoes s JOIN solicitacao_itens si ON si.solicitacao_id=s.id
      GROUP BY s.os_id, s.equipamento_id, s.id;
  `);

  // Retrocompatibilidade segura: somente uma linha permite derivar preço legado.
  const antigas = db.prepare(`SELECT s.id, s.valor_total, si.id item_id, si.qtd_solicitada
    FROM solicitacoes s JOIN solicitacao_itens si ON si.solicitacao_id=s.id
    WHERE s.valor_total IS NOT NULL AND s.valor_total>=0 AND si.valor_unitario_centavos IS NULL
      AND (SELECT COUNT(*) FROM solicitacao_itens x WHERE x.solicitacao_id=s.id)=1
      AND si.qtd_solicitada>0`).all();
  const backfill = db.prepare('UPDATE solicitacao_itens SET valor_unitario_centavos=?, status_cotacao=\'PENDENTE\' WHERE id=?');
  antigas.forEach((row) => backfill.run(Math.round(Number(row.valor_total) * 100 / Number(row.qtd_solicitada)), row.item_id));
};
