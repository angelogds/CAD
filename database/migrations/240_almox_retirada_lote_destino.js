module.exports = ({ db, tableExists, addColumnIfMissing }) => {
  if (!tableExists('solicitacoes') || !tableExists('estoque_movimentos')) return;
  db.transaction(() => {
  db.exec(`CREATE TABLE IF NOT EXISTS estoque_retirada_operacoes (
    token TEXT PRIMARY KEY, solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id),
    usuario_id INTEGER NOT NULL REFERENCES users(id), payload_hash TEXT NOT NULL,
    resultado_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  addColumnIfMissing('estoque_movimentos', 'retirada_lote_token', 'retirada_lote_token TEXT REFERENCES estoque_retirada_operacoes(token)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_mov_retirada_lote ON estoque_movimentos(retirada_lote_token)');
  if (!tableExists('solicitacao_itens')) return;
  addColumnIfMissing('solicitacao_itens', 'destino_recebimento', 'destino_recebimento TEXT');
  if (!tableExists('estoque_reservas')) return;
  // Só os NOVOS recebimentos explicitamente destinados à prateleira deixam de
  // gerar reserva. Preserva reservas e retiradas anteriores, sem backfill.
  db.exec(`DROP TRIGGER IF EXISTS trg_estoque_reserva_recebimento_solicitacao;
    CREATE TRIGGER trg_estoque_reserva_recebimento_solicitacao
    AFTER UPDATE OF qtd_recebida_total, estoque_item_id ON solicitacao_itens
    WHEN NEW.estoque_item_id IS NOT NULL AND COALESCE(NEW.qtd_recebida_total,0)>0
      AND COALESCE(NEW.destino_recebimento,'')<>'PRATELEIRA'
    BEGIN
      INSERT INTO estoque_reservas
        (solicitacao_id,solicitacao_item_id,estoque_item_id,os_id,equipamento_id,quantidade_reservada,quantidade_retirada,status,origem,created_at,updated_at)
      VALUES (NEW.solicitacao_id,NEW.id,NEW.estoque_item_id,
        (SELECT os_id FROM solicitacoes WHERE id=NEW.solicitacao_id),
        (SELECT equipamento_id FROM solicitacoes WHERE id=NEW.solicitacao_id),
        NEW.qtd_recebida_total,0,'RESERVADA','RECEBIMENTO_COMPRA',datetime('now'),datetime('now'))
      ON CONFLICT(solicitacao_item_id) DO UPDATE SET
        estoque_item_id=excluded.estoque_item_id, os_id=excluded.os_id, equipamento_id=excluded.equipamento_id,
        quantidade_reservada=excluded.quantidade_reservada,
        status=CASE WHEN estoque_reservas.quantidade_retirada>=excluded.quantidade_reservada THEN 'RETIRADA'
          WHEN estoque_reservas.quantidade_retirada>0 THEN 'PARCIAL' ELSE 'RESERVADA' END,
        updated_at=datetime('now');
    END;`);
  })();
};
