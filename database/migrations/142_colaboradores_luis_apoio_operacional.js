module.exports = function up({ db, tableExists, columnExists }) {
  if (!tableExists("colaboradores") || !columnExists("colaboradores", "funcao")) return;

  db.exec(`
    UPDATE colaboradores
    SET funcao = 'AUXILIAR'
    WHERE nome LIKE '%Luís%'
       OR nome LIKE '%Luis%'
       OR nome LIKE '%Luiz%';
  `);

  if (columnExists("colaboradores", "tipo_turno")) {
    db.exec(`
      UPDATE colaboradores
      SET tipo_turno = 'apoio'
      WHERE nome LIKE '%Luís%'
         OR nome LIKE '%Luis%'
         OR nome LIKE '%Luiz%';
    `);
  }
};
