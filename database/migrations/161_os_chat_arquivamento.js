module.exports.up = ({ db, addColumnIfMissing }) => {
  addColumnIfMissing('os', 'chat_arquivada', 'chat_arquivada INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('os', 'status_chat', "status_chat TEXT NOT NULL DEFAULT 'ATIVO'");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_os_chat_status_operacional
      ON os (status, status_chat, chat_arquivada);

    UPDATE os
       SET chat_arquivada = 1,
           status_chat = 'ARQUIVADO'
     WHERE UPPER(COALESCE(status,'')) IN ('FECHADA','FECHADO','CONCLUIDA','CONCLUÍDA','FINALIZADA','FINALIZADO','CANCELADA','CANCELADO');
  `);
};
