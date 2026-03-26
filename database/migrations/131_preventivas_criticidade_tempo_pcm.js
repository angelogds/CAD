module.exports = function up({ db, addColumnIfMissing }) {
  addColumnIfMissing("equipamentos", "criticidade_base", "criticidade_base TEXT DEFAULT 'MEDIA'");
  addColumnIfMissing("equipamentos", "impacto_operacional", "impacto_operacional TEXT DEFAULT 'MEDIO'");

  addColumnIfMissing("preventiva_execucoes", "finalizada_por_user_id", "finalizada_por_user_id INTEGER REFERENCES users(id)");
  addColumnIfMissing("preventiva_execucoes", "duracao_minutos", "duracao_minutos INTEGER");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_equip_criticidade_base ON equipamentos(criticidade_base);
    CREATE INDEX IF NOT EXISTS idx_prev_exec_finalizada_por ON preventiva_execucoes(finalizada_por_user_id);
    CREATE INDEX IF NOT EXISTS idx_prev_exec_duracao ON preventiva_execucoes(duracao_minutos);
  `);
};
