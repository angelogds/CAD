module.exports = ({ db, tableExists, columnExists }) => {
  if (!tableExists('anexos')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS anexos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referencia_tipo TEXT NOT NULL,
        referencia_id INTEGER NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'COTACAO',
        filename TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT,
        size INTEGER,
        uploaded_by INTEGER,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  const ensureAnexosColumn = (name, definition) => {
    if (!columnExists('anexos', name)) {
      db.exec(`ALTER TABLE anexos ADD COLUMN ${name} ${definition};`);
    }
  };

  ensureAnexosColumn('referencia_tipo', 'TEXT');
  ensureAnexosColumn('referencia_id', 'INTEGER');
  ensureAnexosColumn('tipo', "TEXT NOT NULL DEFAULT 'COTACAO'");
  ensureAnexosColumn('original_name', 'TEXT');
  ensureAnexosColumn('mime_type', 'TEXT');
  ensureAnexosColumn('size', 'INTEGER');
};
