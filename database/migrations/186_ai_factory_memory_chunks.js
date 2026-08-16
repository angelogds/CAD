module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_memory_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      chunk_key TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      metadata_json TEXT,
      embedding_json TEXT,
      embedding_model TEXT,
      source_updated_at TEXT,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      UNIQUE(source_type, source_id, chunk_key)
    );

    CREATE INDEX IF NOT EXISTS idx_ai_memory_chunks_source
      ON ai_memory_chunks(source_type, source_id, active);

    CREATE INDEX IF NOT EXISTS idx_ai_memory_chunks_hash
      ON ai_memory_chunks(content_hash);

    CREATE INDEX IF NOT EXISTS idx_ai_memory_chunks_active_updated
      ON ai_memory_chunks(active, indexed_at DESC);
  `);
};
