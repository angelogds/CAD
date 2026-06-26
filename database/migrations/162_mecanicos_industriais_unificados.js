module.exports = function up({ db, tableExists, columnExists }) {
  if (!tableExists("colaboradores") || !columnExists("colaboradores", "funcao") || !columnExists("colaboradores", "nome")) return;

  const nomes = ["Diogo", "Salviano", "Rodolfo", "Emanuel", "Luiz", "Luis", "Luís", "Júnior", "Junior"];
  const placeholders = nomes.map(() => "lower(?)").join(",");
  db.prepare(`
    UPDATE colaboradores
    SET funcao = 'mecanico'
    WHERE lower(nome) IN (${placeholders})
  `).run(...nomes);
};
