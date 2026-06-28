module.exports = function up({ db, tableExists, columnExists }) {
  const nomesOficiais = ["Diogo", "Salviano", "Rodolfo", "Emanuel", "Luiz", "Luiz", "Luiz", "Júnior", "Junior"];
  const funcoesAntigas = [
    "apoio",
    "apoio operacional",
    "auxiliar",
    "auxiliar de mecanico",
    "auxiliar de mecânico",
    "ajudante",
    "operacional",
    "mecanico",
    "mecânico",
    "mecanico industrial",
    "mecânico industrial",
  ];

  if (tableExists("colaboradores")) {
    if (columnExists("colaboradores", "funcao")) {
      const placeholders = funcoesAntigas.map(() => "?").join(",");
      db.prepare(`
        UPDATE colaboradores
        SET funcao = 'mecanico'
        WHERE lower(trim(COALESCE(funcao, ''))) IN (${placeholders})
      `).run(...funcoesAntigas.map((f) => f.toLowerCase()));
    }

    if (columnExists("colaboradores", "nome")) {
      const placeholders = nomesOficiais.map(() => "lower(?)").join(",");
      const sets = [];
      if (columnExists("colaboradores", "funcao")) sets.push("funcao = 'mecanico'");
      if (columnExists("colaboradores", "ativo")) sets.push("ativo = 1");
      if (sets.length) {
        db.prepare(`
          UPDATE colaboradores
          SET ${sets.join(", ")}
          WHERE lower(nome) IN (${placeholders})
        `).run(...nomesOficiais);
      }
    }

    if (columnExists("colaboradores", "funcao")) {
      db.exec(`DROP TRIGGER IF EXISTS trg_colaboradores_bloqueia_funcao_antiga_insert;`);
      db.exec(`DROP TRIGGER IF EXISTS trg_colaboradores_bloqueia_funcao_antiga_update;`);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_colaboradores_bloqueia_funcao_antiga_insert
        BEFORE INSERT ON colaboradores
        FOR EACH ROW
        WHEN lower(trim(COALESCE(NEW.funcao, 'mecanico'))) IN ('apoio','apoio operacional','auxiliar','auxiliar de mecanico','auxiliar de mecânico','ajudante','operacional')
        BEGIN
          SELECT RAISE(ABORT, 'Função antiga inválida: use mecanico');
        END;
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_colaboradores_bloqueia_funcao_antiga_update
        BEFORE UPDATE OF funcao ON colaboradores
        FOR EACH ROW
        WHEN lower(trim(COALESCE(NEW.funcao, 'mecanico'))) IN ('apoio','apoio operacional','auxiliar','auxiliar de mecanico','auxiliar de mecânico','ajudante','operacional')
        BEGIN
          SELECT RAISE(ABORT, 'Função antiga inválida: use mecanico');
        END;
      `);
    }
  }

  if (tableExists("escala_alocacoes") && columnExists("escala_alocacoes", "tipo_turno")) {
    db.prepare(`UPDATE escala_alocacoes SET tipo_turno = 'diurno' WHERE lower(trim(COALESCE(tipo_turno, ''))) = 'apoio'`).run();
  }
};
