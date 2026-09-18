const { deriveUserFunctionSector } = require('../../modules/usuarios/usuarios.perfil');

module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (!tableExists('users')) return;

  addColumnIfMissing('users', 'funcao', 'funcao TEXT');
  addColumnIfMissing('users', 'setor', 'setor TEXT');
  addColumnIfMissing('users', 'qr_token', 'qr_token TEXT');
  addColumnIfMissing('users', 'qr_ativo', 'qr_ativo INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('users', 'qr_emitido_em', 'qr_emitido_em TEXT');
  addColumnIfMissing('users', 'qr_revogado_em', 'qr_revogado_em TEXT');

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_qr_token ON users(qr_token) WHERE qr_token IS NOT NULL;');

  const rows = db.prepare('SELECT id, role, funcao, setor FROM users').all();
  const update = db.prepare(`
    UPDATE users
    SET funcao = COALESCE(NULLIF(TRIM(funcao), ''), ?),
        setor = COALESCE(NULLIF(TRIM(setor), ''), ?)
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    for (const row of rows) {
      const derived = deriveUserFunctionSector(row.role);
      if (!derived.funcao && !derived.setor) continue;
      update.run(derived.funcao, derived.setor, Number(row.id));
    }
  });
  tx();

  if (tableExists('estoque_movimentos')) {
    addColumnIfMissing(
      'estoque_movimentos',
      'retirado_por_user_id',
      'retirado_por_user_id INTEGER REFERENCES users(id)'
    );
    db.exec('CREATE INDEX IF NOT EXISTS idx_estoque_mov_retirado_por_user ON estoque_movimentos(retirado_por_user_id);');
  }
};
