module.exports = function up({ db, addColumnIfMissing }) {
  addColumnIfMissing("os_whatsapp_notificacoes", "whatsapp_message_id", "whatsapp_message_id TEXT");
  addColumnIfMissing("os_whatsapp_notificacoes", "provider_response_json", "provider_response_json TEXT");
  addColumnIfMissing("os_whatsapp_notificacoes", "template_name", "template_name TEXT");
  addColumnIfMissing("os_whatsapp_notificacoes", "entregue_em", "entregue_em DATETIME");
  addColumnIfMissing("os_whatsapp_notificacoes", "lido_em", "lido_em DATETIME");
  addColumnIfMissing("os_whatsapp_notificacoes", "falhou_em", "falhou_em DATETIME");

  db.exec(`
    CREATE TABLE IF NOT EXISTS os_whatsapp_status_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER,
      notificacao_id INTEGER,
      whatsapp_message_id TEXT,
      recipient_phone TEXT,
      status TEXT,
      erro TEXT,
      raw_json TEXT,
      recebido_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_os_whatsapp_status_msg
      ON os_whatsapp_status_eventos(whatsapp_message_id, recebido_em);

    CREATE INDEX IF NOT EXISTS idx_os_whatsapp_status_os
      ON os_whatsapp_status_eventos(os_id, recebido_em);

    CREATE INDEX IF NOT EXISTS idx_os_whatsapp_notificacoes_message_id
      ON os_whatsapp_notificacoes(whatsapp_message_id);
  `);
};
