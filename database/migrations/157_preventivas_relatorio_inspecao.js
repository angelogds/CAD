module.exports = function up({ db, addColumnIfMissing }) {
  const fields = [
    ["descricao_preventiva", "descricao_preventiva TEXT"],
    ["itens_verificados", "itens_verificados TEXT"],
    ["nao_conformidade", "nao_conformidade TEXT"],
    ["tem_nao_conformidade", "tem_nao_conformidade INTEGER NOT NULL DEFAULT 0"],
    ["acao_corretiva", "acao_corretiva TEXT"],
    ["acao_preventiva", "acao_preventiva TEXT"],
    ["situacao_final", "situacao_final TEXT"],
    ["observacoes_tecnicas", "observacoes_tecnicas TEXT"],
    ["evidencias", "evidencias TEXT"],
    ["os_corretiva_id", "os_corretiva_id INTEGER REFERENCES os(id)"],
    ["registrado_relatorio_em", "registrado_relatorio_em TEXT"],
  ];
  fields.forEach(([column, ddl]) => addColumnIfMissing("preventiva_execucoes", column, ddl));

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prev_exec_relatorio_data ON preventiva_execucoes(data_executada, status);
    CREATE INDEX IF NOT EXISTS idx_prev_exec_nao_conformidade ON preventiva_execucoes(tem_nao_conformidade);
    CREATE INDEX IF NOT EXISTS idx_prev_exec_os_corretiva ON preventiva_execucoes(os_corretiva_id);
  `);
};
