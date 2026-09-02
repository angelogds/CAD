module.exports = ({ db, tableExists, columnExists, addColumnIfMissing }) => {
  if (tableExists('estoque_movimentos')) {
    addColumnIfMissing('estoque_movimentos', 'os_id', 'os_id INTEGER');
    addColumnIfMissing('estoque_movimentos', 'equipamento_id', 'equipamento_id INTEGER');
    addColumnIfMissing('estoque_movimentos', 'solicitacao_id', 'solicitacao_id INTEGER');
    addColumnIfMissing('estoque_movimentos', 'solicitacao_item_id', 'solicitacao_item_id INTEGER');
    addColumnIfMissing('estoque_movimentos', 'saldo_anterior', 'saldo_anterior REAL');
    addColumnIfMissing('estoque_movimentos', 'saldo_posterior', 'saldo_posterior REAL');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_estoque_mov_os ON estoque_movimentos(os_id);
      CREATE INDEX IF NOT EXISTS idx_estoque_mov_equipamento ON estoque_movimentos(equipamento_id);
      CREATE INDEX IF NOT EXISTS idx_estoque_mov_solicitacao ON estoque_movimentos(solicitacao_id);
      CREATE INDEX IF NOT EXISTS idx_estoque_mov_solicitacao_item ON estoque_movimentos(solicitacao_item_id);
    `);
  }

  if (!tableExists('compras_recebimentos')) {
    db.exec(`
      CREATE TABLE compras_recebimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        solicitacao_id INTEGER NOT NULL,
        solicitacao_item_id INTEGER NOT NULL,
        quantidade REAL NOT NULL,
        estoque_item_id INTEGER NOT NULL,
        estoque_movimento_id INTEGER,
        usuario_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id),
        FOREIGN KEY (solicitacao_item_id) REFERENCES solicitacao_itens(id),
        FOREIGN KEY (estoque_item_id) REFERENCES estoque_itens(id),
        FOREIGN KEY (usuario_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_compras_recebimentos_solicitacao ON compras_recebimentos(solicitacao_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_compras_recebimentos_item ON compras_recebimentos(solicitacao_item_id, id DESC);
    `);
  } else {
    const required = [
      ['solicitacao_id', 'INTEGER'],
      ['solicitacao_item_id', 'INTEGER'],
      ['quantidade', 'REAL'],
      ['estoque_item_id', 'INTEGER'],
      ['estoque_movimento_id', 'INTEGER'],
      ['usuario_id', 'INTEGER'],
      // Em ALTER TABLE do SQLite usamos TEXT simples; novos registros podem
      // continuar sendo preenchidos pelo código quando necessário.
      ['created_at', 'TEXT'],
    ];
    for (const [name, ddl] of required) {
      if (!columnExists('compras_recebimentos', name)) addColumnIfMissing('compras_recebimentos', name, `${name} ${ddl}`);
    }
  }
};
