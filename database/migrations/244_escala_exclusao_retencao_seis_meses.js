module.exports = ({ db, tableExists, addColumnIfMissing }) => {
  if (!tableExists('colaboradores')) return;
  addColumnIfMissing('colaboradores', 'fora_escala', 'fora_escala INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS escala_colaboradores_exclusoes (
    colaborador_id INTEGER PRIMARY KEY REFERENCES colaboradores(id),
    excluido_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
    excluido_em TEXT NOT NULL,
    apagar_apos TEXT NOT NULL,
    purgado_em TEXT,
    arquivos_pendentes TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS idx_escala_exclusoes_prazo ON escala_colaboradores_exclusoes(apagar_apos) WHERE purgado_em IS NULL;`);
};
