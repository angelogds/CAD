module.exports = ({ db, tableExists, addColumnIfMissing }) => {
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

  if (tableExists('solicitacao_itens') && tableExists('solicitacoes')) {
    db.exec(`
      INSERT OR IGNORE INTO estoque_reservas
        (solicitacao_id,solicitacao_item_id,estoque_item_id,os_id,equipamento_id,quantidade_reservada,quantidade_retirada,status,origem,created_at,updated_at)
      SELECT si.solicitacao_id,si.id,si.estoque_item_id,s.os_id,s.equipamento_id,
             COALESCE(si.qtd_recebida_total,0),0,
             CASE WHEN COALESCE(si.qtd_recebida_total,0)>0 THEN 'RESERVADA' ELSE 'AGUARDANDO' END,
             'MIGRACAO_RECEBIMENTO',datetime('now'),datetime('now')
      FROM solicitacao_itens si
      JOIN solicitacoes s ON s.id=si.solicitacao_id
      WHERE si.estoque_item_id IS NOT NULL AND COALESCE(si.qtd_recebida_total,0)>0;

      DROP TRIGGER IF EXISTS trg_estoque_reserva_recebimento_solicitacao;
      CREATE TRIGGER trg_estoque_reserva_recebimento_solicitacao
      AFTER UPDATE OF qtd_recebida_total, estoque_item_id ON solicitacao_itens
      WHEN NEW.estoque_item_id IS NOT NULL AND COALESCE(NEW.qtd_recebida_total,0)>0
      BEGIN
        INSERT INTO estoque_reservas
          (solicitacao_id,solicitacao_item_id,estoque_item_id,os_id,equipamento_id,quantidade_reservada,quantidade_retirada,status,origem,created_at,updated_at)
        VALUES (
          NEW.solicitacao_id,NEW.id,NEW.estoque_item_id,
          (SELECT os_id FROM solicitacoes WHERE id=NEW.solicitacao_id),
          (SELECT equipamento_id FROM solicitacoes WHERE id=NEW.solicitacao_id),
          COALESCE(NEW.qtd_recebida_total,0),0,'RESERVADA','RECEBIMENTO_COMPRA',datetime('now'),datetime('now')
        )
        ON CONFLICT(solicitacao_item_id) DO UPDATE SET
          estoque_item_id=excluded.estoque_item_id,
          os_id=excluded.os_id,
          equipamento_id=excluded.equipamento_id,
          quantidade_reservada=excluded.quantidade_reservada,
          status=CASE
            WHEN estoque_reservas.quantidade_retirada >= excluded.quantidade_reservada THEN 'RETIRADA'
            WHEN estoque_reservas.quantidade_retirada > 0 THEN 'PARCIAL'
            ELSE 'RESERVADA'
          END,
          updated_at=datetime('now');
      END;
    `);
  }

  if (tableExists('estoque_movimentos')) {
    addColumnIfMissing('estoque_movimentos', 'reserva_id', 'reserva_id INTEGER REFERENCES estoque_reservas(id)');
    addColumnIfMissing('estoque_movimentos', 'retirado_por_colaborador_id', 'retirado_por_colaborador_id INTEGER REFERENCES colaboradores(id)');
    addColumnIfMissing('estoque_movimentos', 'entregue_por_user_id', 'entregue_por_user_id INTEGER REFERENCES users(id)');
    addColumnIfMissing('estoque_movimentos', 'identificacao_origem', "identificacao_origem TEXT DEFAULT 'MANUAL'");
    db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_mov_reserva ON estoque_movimentos(reserva_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_mov_retirado_por ON estoque_movimentos(retirado_por_colaborador_id);');
  }

  if (tableExists('estoque_itens')) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_estoque_proteger_saldo_reservado;
      CREATE TRIGGER trg_estoque_proteger_saldo_reservado
      BEFORE UPDATE OF saldo_atual ON estoque_itens
      WHEN NEW.saldo_atual < COALESCE((
        SELECT SUM(MAX(r.quantidade_reservada-r.quantidade_retirada,0))
        FROM estoque_reservas r
        WHERE r.estoque_item_id=NEW.id AND r.status<>'CANCELADA'
      ),0)
      BEGIN
        SELECT RAISE(ABORT,'Saldo reservado para solicitações não pode ser consumido por retirada avulsa.');
      END;
    `);
  }
};
