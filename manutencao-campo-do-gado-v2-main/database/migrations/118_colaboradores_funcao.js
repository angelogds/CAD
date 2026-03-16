module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  if (!tableExists("colaboradores")) return;

  addColumnIfMissing("colaboradores", "funcao", "funcao TEXT DEFAULT 'AUXILIAR'");

  db.exec("UPDATE colaboradores SET funcao = UPPER(COALESCE(funcao, 'AUXILIAR'))");
  db.exec("UPDATE colaboradores SET funcao = 'MECANICO' WHERE nome LIKE '%Diogo%'");
  db.exec("UPDATE colaboradores SET funcao = 'MECANICO' WHERE nome LIKE '%Rodolfo%'");
  db.exec("UPDATE colaboradores SET funcao = 'MECANICO' WHERE nome LIKE '%Salviano%'");
  db.exec("UPDATE colaboradores SET funcao = 'AUXILIAR' WHERE nome LIKE '%Luiz%'");
  db.exec("UPDATE colaboradores SET funcao = 'AUXILIAR' WHERE nome LIKE '%Emanuel%'");
  db.exec("UPDATE colaboradores SET funcao = 'AUXILIAR' WHERE nome LIKE '%Júnior%' OR nome LIKE '%Junior%'");
};
