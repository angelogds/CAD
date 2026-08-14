module.exports.up = ({ db, tableExists, addColumnIfMissing }) => {
  if (!tableExists("equipamentos")) return;

  [
    ["modelo", "modelo TEXT"], ["numero_serie", "numero_serie TEXT"],
    ["data_instalacao", "data_instalacao TEXT"], ["responsavel_setor", "responsavel_setor TEXT"],
    ["possui_plano_preventivo", "possui_plano_preventivo INTEGER NOT NULL DEFAULT 0"],
    ["periodicidade_preventiva", "periodicidade_preventiva TEXT"],
    ["unidade_capacidade", "unidade_capacidade TEXT"], ["unidade_pressao", "unidade_pressao TEXT"],
    ["potencia", "potencia REAL"], ["unidade_potencia", "unidade_potencia TEXT"],
    ["tensao", "tensao TEXT"], ["observacoes_tecnicas", "observacoes_tecnicas TEXT"],
  ].forEach(([name, ddl]) => addColumnIfMissing("equipamentos", name, ddl));

  db.exec(`
    UPDATE equipamentos SET status_operacional = CASE
      WHEN ativo = 0 THEN 'INATIVO'
      WHEN UPPER(COALESCE(status_operacional,'')) IN ('EM MANUTENCAO','EM MANUTENÇÃO') THEN 'EM_MANUTENCAO'
      WHEN UPPER(COALESCE(status_operacional,'')) = 'PARADO' THEN 'PARADO'
      ELSE 'EM_OPERACAO' END;
    CREATE INDEX IF NOT EXISTS idx_equip_status_operacional ON equipamentos(status_operacional);
    CREATE INDEX IF NOT EXISTS idx_equip_criticidade ON equipamentos(criticidade);
  `);
};
