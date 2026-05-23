module.exports = function ({ db, tableExists, columnExists, addColumnIfMissing }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_cleanup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mes_referencia TEXT NOT NULL,
      data_execucao TEXT NOT NULL,
      retention_days INTEGER NOT NULL,
      arquivos_encontrados INTEGER NOT NULL DEFAULT 0,
      arquivos_removidos INTEGER NOT NULL DEFAULT 0,
      espaco_liberado_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      detalhes TEXT,
      executado_por TEXT DEFAULT 'sistema'
    )
  `);

  const targetTable = tableExists('os_anexos') ? 'os_anexos' : (tableExists('anexos') ? 'anexos' : null);
  if (targetTable) {
    addColumnIfMissing(targetTable, 'removido_em', 'removido_em TEXT');
    addColumnIfMissing(targetTable, 'removido_por', 'removido_por TEXT');
    addColumnIfMissing(targetTable, 'motivo_remocao', 'motivo_remocao TEXT');
    addColumnIfMissing(targetTable, 'arquivo_removido', 'arquivo_removido INTEGER NOT NULL DEFAULT 0');
  }
};
