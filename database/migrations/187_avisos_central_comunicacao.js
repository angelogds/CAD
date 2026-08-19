module.exports = ({ addColumnIfMissing, db }) => {
  addColumnIfMissing('avisos', 'categoria', "categoria TEXT DEFAULT 'GERAL'");
  addColumnIfMissing('avisos', 'prioridade', "prioridade TEXT DEFAULT 'NORMAL'");
  addColumnIfMissing('avisos', 'status', "status TEXT DEFAULT 'PUBLICADO'");
  addColumnIfMissing('avisos', 'publish_at', 'publish_at TEXT');

  if (db) {
    db.exec(`
      UPDATE avisos
         SET categoria = COALESCE(NULLIF(categoria, ''), 'GERAL'),
             prioridade = COALESCE(NULLIF(prioridade, ''), 'NORMAL'),
             status = COALESCE(NULLIF(status, ''), 'PUBLICADO'),
             publish_at = COALESCE(publish_at, created_at),
             updated_at = COALESCE(updated_at, created_at, datetime('now'));
      CREATE INDEX IF NOT EXISTS idx_avisos_categoria ON avisos(categoria);
      CREATE INDEX IF NOT EXISTS idx_avisos_prioridade ON avisos(prioridade);
      CREATE INDEX IF NOT EXISTS idx_avisos_status ON avisos(status);
      CREATE INDEX IF NOT EXISTS idx_avisos_publish_at ON avisos(publish_at);
    `);
  }
};
