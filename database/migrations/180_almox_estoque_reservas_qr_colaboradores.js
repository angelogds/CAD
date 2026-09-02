module.exports = ({ db, tableExists, columnExists, addColumnIfMissing }) => {
  if (tableExists('colaboradores')) {
    addColumnIfMissing('colaboradores', 'qr_token', 'qr_token TEXT');
    addColumnIfMissing('colaboradores', 'qr_ativo', 'qr_ativo INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('colaboradores', 'qr_emitido_em', 'qr_emitido_em TEXT');
    addColumnIfMissing('colaboradores', 'qr_revogado_em', 'qr_revogado_em TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_qr_token ON colaboradores(qr_token) WHERE qr_token IS NOT NULL;');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS estoque_reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER NOT NULL,
      solicitacao_item_id INTEGER NOT NULL,
      estoque_item_id INTEGER NOT NULL,
      os_id INTEGER,
      equipamento_id INTEGER,
      quantidade_reservada REAL NOT NULL DEFAULT 0,
      quantidade_retirada REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'RESERVADA',
      origem TEXT NOT NULL DEFAULT 'RECEBIMENTO_COMPRA',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id),
      FOREIGN KEY (solicitacao_item_id) REFERENCES solicitacao_itens(id),
      FOREIGN KEY (estoque_item_id) REFERENCES estoque_itens(id),
      FOREIGN KEY (os_id) REFERENCES os(id),
      FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_reservas_sol_item ON estoque_reservas(solicitacao_item_id);
    CREATE INDEX IF NOT EXISTS idx_estoque_reservas_estoque ON estoque_reservas(estoque_item_id,status);
    CREATE INDEX IF NOT EXISTS idx_estoque_reservas_solicitacao ON estoque_reservas(solicitacao_id,status);
  `);

  if (tableExists('estoque_movimentos')) {
    addColumnIfMissing('estoque_movimentos', 'reserva_id', 'reserva_id INTEGER REFERENCES estoque_reservas(id)');
    addColumnIfMissing('estoque_movimentos', 'retirado_por_colaborador_id', 'retirado_por_colaborador_id INTEGER REFERENCES colaboradores(id)');
    addColumnIfMissing('estoque_movimentos', 'entregue_por_user_id', 'entregue_por_user_id INTEGER REFERENCES users(id)');
    addColumnIfMissing('estoque_movimentos', 'identificacao_origem', "identificacao_origem TEXT DEFAULT 'MANUAL'");
    db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_mov_reserva ON estoque_movimentos(reserva_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_mov_retirado_por ON estoque_movimentos(retirado_por_colaborador_id);');
  }
};
