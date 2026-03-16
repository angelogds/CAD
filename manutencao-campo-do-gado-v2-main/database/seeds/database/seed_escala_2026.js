// database/seed_escala_2026.js
const db = require("./db");

// ==== AJUSTE AQUI se seus nomes no banco estiverem diferentes ====
// (o script procura "LIKE %nome%")
const NAMES = {
  diogo: "Diogo",
  salviano: "Salviano",
  rodolfo: "Rodolfo",
  emanuel: "Emanuel",
  luiz: "Luiz",
  junior: "Júnior", // se no banco for "Junior", pode trocar aqui
};

// ====== DADOS DO PDF (52 semanas) ======
// Fonte: "ESCALA SEMANAL – TURNO NOTURNO + TURNO DIURNO" :contentReference[oaicite:1]{index=1}
const WEEKS = [
  { semana: 1,  inicio: "2026-01-05", fim: "2026-01-11", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 2,  inicio: "2026-01-12", fim: "2026-01-18", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 3,  inicio: "2026-01-19", fim: "2026-01-25", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 4,  inicio: "2026-01-26", fim: "2026-02-01", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 5,  inicio: "2026-02-02", fim: "2026-02-08", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 6,  inicio: "2026-02-09", fim: "2026-02-15", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 7,  inicio: "2026-02-16", fim: "2026-02-22", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 8,  inicio: "2026-02-23", fim: "2026-03-01", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 9,  inicio: "2026-03-02", fim: "2026-03-08", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 10, inicio: "2026-03-09", fim: "2026-03-15", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 11, inicio: "2026-03-16", fim: "2026-03-22", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 12, inicio: "2026-03-23", fim: "2026-03-29", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 13, inicio: "2026-03-30", fim: "2026-04-05", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 14, inicio: "2026-04-06", fim: "2026-04-12", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 15, inicio: "2026-04-13", fim: "2026-04-19", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 16, inicio: "2026-04-20", fim: "2026-04-26", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 17, inicio: "2026-04-27", fim: "2026-05-03", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 18, inicio: "2026-05-04", fim: "2026-05-10", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 19, inicio: "2026-05-11", fim: "2026-05-17", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 20, inicio: "2026-05-18", fim: "2026-05-24", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 21, inicio: "2026-05-25", fim: "2026-05-31", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 22, inicio: "2026-06-01", fim: "2026-06-07", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 23, inicio: "2026-06-08", fim: "2026-06-14", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 24, inicio: "2026-06-15", fim: "2026-06-21", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 25, inicio: "2026-06-22", fim: "2026-06-28", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 26, inicio: "2026-06-29", fim: "2026-07-05", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 27, inicio: "2026-07-06", fim: "2026-07-12", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 28, inicio: "2026-07-13", fim: "2026-07-19", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 29, inicio: "2026-07-20", fim: "2026-07-26", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 30, inicio: "2026-07-27", fim: "2026-08-02", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 31, inicio: "2026-08-03", fim: "2026-08-09", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 32, inicio: "2026-08-10", fim: "2026-08-16", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 33, inicio: "2026-08-17", fim: "2026-08-23", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 34, inicio: "2026-08-24", fim: "2026-08-30", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 35, inicio: "2026-08-31", fim: "2026-09-06", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 36, inicio: "2026-09-07", fim: "2026-09-13", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 37, inicio: "2026-09-14", fim: "2026-09-20", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 38, inicio: "2026-09-21", fim: "2026-09-27", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 39, inicio: "2026-09-28", fim: "2026-10-04", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 40, inicio: "2026-10-05", fim: "2026-10-11", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 41, inicio: "2026-10-12", fim: "2026-10-18", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 42, inicio: "2026-10-19", fim: "2026-10-25", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 43, inicio: "2026-10-26", fim: "2026-11-01", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 44, inicio: "2026-11-02", fim: "2026-11-08", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 45, inicio: "2026-11-09", fim: "2026-11-15", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 46, inicio: "2026-11-16", fim: "2026-11-22", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 47, inicio: "2026-11-23", fim: "2026-11-29", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 48, inicio: "2026-11-30", fim: "2026-12-06", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 49, inicio: "2026-12-07", fim: "2026-12-13", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 50, inicio: "2026-12-14", fim: "2026-12-20", noturno: "Salviano", diurno: ["Diogo","Rodolfo"],    apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 51, inicio: "2026-12-21", fim: "2026-12-27", noturno: "Rodolfo",  diurno: ["Diogo","Salviano"],   apoio: ["Emanuel","Luiz","Júnior"] },
  { semana: 52, inicio: "2026-12-28", fim: "2027-01-01", noturno: "Diogo",    diurno: ["Salviano","Rodolfo"], apoio: ["Emanuel","Luiz","Júnior"] },
];

// ===== Helpers DB =====
function findUserIdByName(name) {
  if (!name) return null;
  const row = db
    .prepare(`SELECT id, name FROM users WHERE lower(name) LIKE lower(?) LIMIT 1`)
    .get(`%${name}%`);
  return row?.id || null;
}

function tableExists(name) {
  const r = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
  return !!r;
}

exports.seedEscala2026 = function seedEscala2026() {
  // ✅ Ajuste esses nomes de tabela/colunas se o seu migration 060/061 tiver outro nome.
  // Eu deixei um padrão bem comum:
  const T_ESCALA = "escala_semanas";
  const T_LINK = "escala_semana_usuarios";

  if (!tableExists(T_ESCALA)) {
    console.warn(`⚠️ Tabela ${T_ESCALA} não existe. Ajuste o nome conforme sua migration 060_escala.sql`);
    return;
  }
  if (!tableExists(T_LINK)) {
    console.warn(`⚠️ Tabela ${T_LINK} não existe. Ajuste o nome conforme sua migration 061_escala_link_user.sql`);
    return;
  }

  // resolve IDs
  const ids = {
    Diogo: findUserIdByName(NAMES.diogo),
    Salviano: findUserIdByName(NAMES.salviano),
    Rodolfo: findUserIdByName(NAMES.rodolfo),
    Emanuel: findUserIdByName(NAMES.emanuel),
    Luiz: findUserIdByName(NAMES.luiz),
    "Júnior": findUserIdByName(NAMES.junior),
  };

  // valida (se faltar algum, avisa)
  Object.entries(ids).forEach(([k, v]) => {
    if (!v) console.warn(`⚠️ Não encontrei usuário no banco para: "${k}". Verifique o nome na tabela users.`);
  });

  const insertSemana = db.prepare(`
    INSERT OR IGNORE INTO escala_semanas (ano, semana, data_inicio, data_fim, turno_noturno_user_id)
    VALUES (@ano, @semana, @inicio, @fim, @noturno_user_id)
  `);

  const findSemanaId = db.prepare(`
    SELECT id FROM escala_semanas WHERE ano=? AND semana=? LIMIT 1
  `);

  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO escala_semana_usuarios (escala_semana_id, user_id, tipo)
    VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const w of WEEKS) {
      const noturnoId = ids[w.noturno] || null;

      insertSemana.run({
        ano: 2026,
        semana: w.semana,
        inicio: w.inicio,
        fim: w.fim,
        noturno_user_id: noturnoId,
      });

      const semanaRow = findSemanaId.get(2026, w.semana);
      if (!semanaRow?.id) continue;

      // limpa vínculos antigos dessa semana (opcional)
      db.prepare(`DELETE FROM escala_semana_usuarios WHERE escala_semana_id=?`).run(semanaRow.id);

      // diurno
      for (const nome of w.diurno) {
        const uid = ids[nome];
        if (uid) insertLink.run(semanaRow.id, uid, "DIURNO");
      }

      // apoio
      for (const nome of w.apoio) {
        const uid = ids[nome];
        if (uid) insertLink.run(semanaRow.id, uid, "APOIO");
      }
    }
  });

  tx();
  console.log("✅ Seed Escala 2026 aplicada (52 semanas).");
};
