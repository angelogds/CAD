module.exports = ({ db, addColumnIfMissing, tableExists, columnExists }) => {
  addColumnIfMissing('escala_rodizio_config', 'modo_noturno', "modo_noturno TEXT NOT NULL DEFAULT 'individual'");
  addColumnIfMissing('escala_rodizio_itens', 'ordem_noturno', 'ordem_noturno INTEGER NOT NULL DEFAULT 1');

  if (tableExists('colaboradores') && columnExists('colaboradores', 'nome')) {
    db.exec("UPDATE colaboradores SET nome = 'Júnior' WHERE lower(nome) = 'junior'");
    db.exec("UPDATE colaboradores SET nome = 'Luiz' WHERE nome IN ('Luis', 'Luís')");
  }

  if (tableExists('users') && columnExists('users', 'name')) {
    db.exec("UPDATE users SET name = 'Júnior' WHERE lower(name) = 'junior'");
    db.exec("UPDATE users SET name = 'Luiz' WHERE name IN ('Luis', 'Luís')");
  }
};
