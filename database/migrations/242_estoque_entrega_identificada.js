module.exports = ({db,tableExists,addColumnIfMissing}) => {
  if (!tableExists('estoque_movimentos')) return;
  db.transaction(() => {
    // Operações sem solicitação usam a mesma movimentação oficial. A tabela
    // de lotes por solicitação (240) mantém suas FKs e reenvios históricos.
    db.exec(`CREATE TABLE IF NOT EXISTS estoque_entrega_operacoes (
      token TEXT PRIMARY KEY,usuario_id INTEGER NOT NULL REFERENCES users(id),
      payload_hash TEXT NOT NULL,resultado_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    addColumnIfMissing('estoque_movimentos','entrega_operacao_token','entrega_operacao_token TEXT REFERENCES estoque_entrega_operacoes(token)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_entrega_operacao ON estoque_movimentos(entrega_operacao_token)');
  })();
};
