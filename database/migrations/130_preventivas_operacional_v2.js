module.exports = function up({ db, addColumnIfMissing }) {
  addColumnIfMissing("preventiva_execucoes", "criticidade", "criticidade TEXT DEFAULT 'MEDIA'");
  addColumnIfMissing("preventiva_execucoes", "responsavel_1_id", "responsavel_1_id INTEGER REFERENCES users(id)");
  addColumnIfMissing("preventiva_execucoes", "responsavel_2_id", "responsavel_2_id INTEGER REFERENCES users(id)");
  addColumnIfMissing("preventiva_execucoes", "iniciada_em", "iniciada_em TEXT");
  addColumnIfMissing("preventiva_execucoes", "finalizada_em", "finalizada_em TEXT");
  addColumnIfMissing("preventiva_execucoes", "iniciada_por_user_id", "iniciada_por_user_id INTEGER REFERENCES users(id)");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prev_exec_criticidade ON preventiva_execucoes(criticidade);
    CREATE INDEX IF NOT EXISTS idx_prev_exec_iniciada_em ON preventiva_execucoes(iniciada_em);
    CREATE INDEX IF NOT EXISTS idx_prev_exec_status_data ON preventiva_execucoes(status, data_prevista);
  `);
};
