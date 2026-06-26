module.exports = function up({ db, tableExists, columnExists }) {
  if (tableExists("colaboradores") && columnExists("colaboradores", "funcao")) {
    db.prepare(`
      UPDATE colaboradores
      SET funcao = 'mecanico'
      WHERE lower(COALESCE(funcao, '')) IN (
        'apoio operacional',
        'apoio',
        'ajudante',
        'auxiliar de mecânico',
        'auxiliar de mecanico',
        'auxiliar',
        'operacional',
        'mecanico',
        'mecânico',
        'mecanico industrial',
        'mecânico industrial'
      )
    `).run();

    if (columnExists("colaboradores", "nome")) {
      const nomes = ["Diogo", "Salviano", "Rodolfo", "Emanuel", "Luiz", "Luis", "Luís", "Júnior", "Junior"];
      const placeholders = nomes.map(() => "lower(?)").join(",");
      db.prepare(`
        UPDATE colaboradores
        SET funcao = 'mecanico'
        WHERE lower(nome) IN (${placeholders})
      `).run(...nomes);
    }
  }

  if (tableExists("escala_alocacoes") && columnExists("escala_alocacoes", "tipo_turno")) {
    db.prepare(`
      UPDATE escala_alocacoes
      SET tipo_turno = 'diurno'
      WHERE lower(COALESCE(tipo_turno, '')) = 'apoio'
    `).run();
  }
};
