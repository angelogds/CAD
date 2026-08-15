/** Integra o saldo canônico e a rastreabilidade Compras -> Almoxarifado -> Estoque. */
module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  if (!tableExists('estoque_itens')) return;
  addColumnIfMissing('estoque_itens', 'saldo_atual', 'saldo_atual REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('estoque_itens', 'saldo_minimo', 'saldo_minimo REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('estoque_itens', 'updated_at', 'updated_at TEXT');

  if (tableExists('estoque_movimentos')) {
    [
      ['origem', 'origem TEXT'], ['os_id', 'os_id INTEGER REFERENCES os(id)'],
      ['equipamento_id', 'equipamento_id INTEGER REFERENCES equipamentos(id)'],
      ['solicitacao_id', 'solicitacao_id INTEGER REFERENCES solicitacoes(id)'],
      ['solicitacao_item_id', 'solicitacao_item_id INTEGER REFERENCES solicitacao_itens(id)'],
      ['usuario_id', 'usuario_id INTEGER REFERENCES users(id)'],
      ['saldo_anterior', 'saldo_anterior REAL'], ['saldo_posterior', 'saldo_posterior REAL'],
    ].forEach(([column, ddl]) => addColumnIfMissing('estoque_movimentos', column, ddl));

    // Só inicializa itens ainda não migrados. Assim uma segunda execução não duplica saldo.
    db.exec(`UPDATE estoque_itens SET saldo_atual = COALESCE((
      SELECT SUM(CASE WHEN UPPER(m.tipo) IN ('ENTRADA','ENTRADA_COMPRA','AJUSTE_ENTRADA') THEN m.quantidade
                      WHEN UPPER(m.tipo) IN ('SAIDA','SAIDA_REQUISICAO_INTERNA','AJUSTE_SAIDA') THEN -m.quantidade ELSE 0 END)
      FROM estoque_movimentos m WHERE m.item_id=estoque_itens.id), 0)
      WHERE updated_at IS NULL;`);
  }
  const minimoLegado = columnExists('estoque_itens', 'estoque_min') ? 'estoque_min' : '0';
  db.exec(`UPDATE estoque_itens SET saldo_minimo=CASE WHEN saldo_minimo=0 THEN COALESCE(${minimoLegado},0) ELSE saldo_minimo END,
    updated_at=COALESCE(updated_at, datetime('now'))`);

  db.exec(`CREATE TABLE IF NOT EXISTS compras_recebimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, solicitacao_id INTEGER NOT NULL,
    solicitacao_item_id INTEGER NOT NULL, quantidade REAL NOT NULL,
    estoque_item_id INTEGER, estoque_movimento_id INTEGER, usuario_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  [['estoque_item_id', 'estoque_item_id INTEGER REFERENCES estoque_itens(id)'],
   ['estoque_movimento_id', 'estoque_movimento_id INTEGER REFERENCES estoque_movimentos(id)']]
    .forEach(([column, ddl]) => addColumnIfMissing('compras_recebimentos', column, ddl));

  if (tableExists('solicitacao_itens')) {
    addColumnIfMissing('solicitacao_itens', 'status_compra', "status_compra TEXT NOT NULL DEFAULT 'PENDENTE'");
    addColumnIfMissing('solicitacao_itens', 'qtd_comprada', 'qtd_comprada REAL');
  }
  db.exec(`DROP VIEW IF EXISTS vw_estoque_saldo;
    CREATE VIEW vw_estoque_saldo AS SELECT id AS item_id, COALESCE(saldo_atual,0) AS saldo FROM estoque_itens;`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_mov_os ON estoque_movimentos(os_id); CREATE INDEX IF NOT EXISTS idx_estoque_mov_solicitacao ON estoque_movimentos(solicitacao_id, solicitacao_item_id);');
};
