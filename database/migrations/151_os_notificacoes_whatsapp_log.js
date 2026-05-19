module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS os_notificacoes_whatsapp_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      enviado_por_usuario_id INTEGER,
      enviado_por_nome TEXT,
      perfil_usuario TEXT,
      colaborador_id INTEGER,
      colaborador_nome TEXT,
      telefone_destino TEXT,
      mensagem TEXT,
      status_envio TEXT NOT NULL,
      resposta_api TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_os_notificacoes_whatsapp_log_os
      ON os_notificacoes_whatsapp_log(os_id, criado_em);

    CREATE INDEX IF NOT EXISTS idx_os_notificacoes_whatsapp_log_usuario
      ON os_notificacoes_whatsapp_log(enviado_por_usuario_id, criado_em);
  `);
};
