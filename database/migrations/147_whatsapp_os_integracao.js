module.exports = function up({ db, addColumnIfMissing }) {
  addColumnIfMissing("users", "telefone_whatsapp", "telefone_whatsapp TEXT");
  addColumnIfMissing("colaboradores", "telefone_whatsapp", "telefone_whatsapp TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS os_whatsapp_notificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      usuario_id INTEGER,
      telefone TEXT,
      tipo_evento TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      mensagem TEXT,
      media_url TEXT,
      erro TEXT,
      enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      criado_por INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_os_whatsapp_notificacoes_os
      ON os_whatsapp_notificacoes(os_id, enviado_em);

    CREATE INDEX IF NOT EXISTS idx_os_whatsapp_notificacoes_dedupe
      ON os_whatsapp_notificacoes(os_id, usuario_id, tipo_evento, status);
  `);
};
