module.exports = function up({ db, addColumnIfMissing }) {
  addColumnIfMissing('os', 'conteudo_ia_json', 'conteudo_ia_json TEXT');
  addColumnIfMissing('os', 'pdf_url', 'pdf_url TEXT');
  addColumnIfMissing('os', 'setor_solicitante', 'setor_solicitante TEXT');
  addColumnIfMissing('os', 'setor_destinatario', 'setor_destinatario TEXT');
  addColumnIfMissing('os', 'responsavel_manutencao', 'responsavel_manutencao TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ordem_servico_documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      tipo_documento TEXT NOT NULL DEFAULT 'ordem_servico_manutencao',
      numero_os TEXT NOT NULL,
      conteudo_ia_json TEXT NOT NULL,
      pdf_url TEXT,
      status TEXT NOT NULL DEFAULT 'GERADO',
      criado_por INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (os_id) REFERENCES os(id)
    );

    CREATE TABLE IF NOT EXISTS ordem_servico_fotos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem_servico_id INTEGER NOT NULL,
      nome_arquivo TEXT,
      caminho_arquivo TEXT,
      descricao_usuario TEXT,
      legenda_ia TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ordem_servico_id) REFERENCES os(id)
    );

    CREATE TABLE IF NOT EXISTS ordem_servico_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem_servico_id INTEGER NOT NULL,
      acao TEXT NOT NULL,
      usuario TEXT,
      data_hora TEXT NOT NULL DEFAULT (datetime('now')),
      observacao TEXT,
      FOREIGN KEY (ordem_servico_id) REFERENCES os(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ordem_servico_documentos_os ON ordem_servico_documentos(os_id, criado_em);
    CREATE INDEX IF NOT EXISTS idx_ordem_servico_fotos_os ON ordem_servico_fotos(ordem_servico_id);
    CREATE INDEX IF NOT EXISTS idx_ordem_servico_historico_os ON ordem_servico_historico(ordem_servico_id, data_hora);
  `);
};
