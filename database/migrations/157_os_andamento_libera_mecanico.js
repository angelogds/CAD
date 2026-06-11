module.exports = function up({ db, addColumnIfMissing }) {
  addColumnIfMissing("os_andamento_motivos", "libera_mecanico", "libera_mecanico INTEGER NOT NULL DEFAULT 1");

  db.prepare(`
    UPDATE os_andamento_motivos
    SET libera_mecanico = CASE
      WHEN codigo IN ('SERVICO_COMPLEXO_CONTINUIDADE', 'MATERIAL_CHEGOU') THEN 0
      ELSE 1
    END
  `).run();
};
