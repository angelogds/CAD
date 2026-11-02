module.exports = ({ db }) => {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS config_sistema (
        chave TEXT PRIMARY KEY,
        valor TEXT
      );
      CREATE TABLE IF NOT EXISTS config_sistema_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chave TEXT NOT NULL,
        valor_anterior TEXT,
        valor_novo TEXT NOT NULL,
        alterado_por_user_id INTEGER REFERENCES users(id),
        alterado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Contingência solicitada: a Diretoria acompanha em modo consulta até
    // o ADMIN reativar a exigência. Nenhuma aprovação existente é alterada.
    db.prepare(`INSERT OR IGNORE INTO config_sistema (chave, valor)
      VALUES ('compras_diretoria_aprovacao_obrigatoria', '0')`).run();
  })();
};
