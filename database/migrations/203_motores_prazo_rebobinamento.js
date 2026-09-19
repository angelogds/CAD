module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (!tableExists('motores')) return;

  addColumnIfMissing('motores', 'previsao_retorno', 'previsao_retorno TEXT');

  if (tableExists('motores_eventos')) {
    addColumnIfMissing('motores_eventos', 'previsao_retorno', 'previsao_retorno TEXT');
  }

  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_motores_previsao_retorno ON motores(previsao_retorno)'
  );
};
