module.exports = function ({ db, addColumnIfMissing }) {
  addColumnIfMissing('media_cleanup_logs', 'caminho_pdf', 'caminho_pdf TEXT');
  addColumnIfMissing('media_cleanup_logs', 'nome_pdf', 'nome_pdf TEXT');
  addColumnIfMissing('media_cleanup_logs', 'pdf_gerado_em', 'pdf_gerado_em TEXT');
  addColumnIfMissing('media_cleanup_logs', 'tipo_execucao', "tipo_execucao TEXT NOT NULL DEFAULT 'AUTOMATICA_MENSAL'");
  addColumnIfMissing('media_cleanup_logs', 'total_os_afetadas', 'total_os_afetadas INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('media_cleanup_logs', 'total_fotos_removidas', 'total_fotos_removidas INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('media_cleanup_logs', 'total_videos_removidos', 'total_videos_removidos INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('media_cleanup_logs', 'total_outros_anexos_removidos', 'total_outros_anexos_removidos INTEGER NOT NULL DEFAULT 0');
};
