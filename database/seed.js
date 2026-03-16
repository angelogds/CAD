// database/seed.js
const bcrypt = require("bcryptjs");
const db = require("./db");

// ✅ Ajuste de senha controlado por ENV
// ADMIN_PASSWORD=admin123
// ADMIN_RESET=1  (só uma vez para forçar reset)
function ensureAdmin() {
  const email = "admin@campodogado.local";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const reset = String(process.env.ADMIN_RESET || "0") === "1";

  const row = db.prepare("SELECT id FROM users WHERE lower(email)=lower(?) LIMIT 1").get(email);

  const hash = bcrypt.hashSync(password, 10);

  if (!row) {
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, datetime('now','-3 hours'))
    `).run("Administrador", email, hash, "ADMIN");

    console.log(`✔ Seed: admin criado (${email} / ${password})`);
    return;
  }

  if (reset) {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, role = 'ADMIN'
      WHERE id = ?
    `).run(hash, row.id);

    console.log(`✔ Seed: admin ATUALIZADO (senha resetada para ${password})`);
  } else {
    console.log("✔ Seed: admin já existe (não resetou senha).");
  }
}

// ---------- ESCALA 2026 (diogo/salviano/rodolfo + apoio) ----------
const ESCALA_2026 = [
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

function ensureColaborador(nome, funcao = "mecanico") {
  let row = db.prepare(`SELECT id FROM colaboradores WHERE lower(nome)=lower(?) LIMIT 1`).get(nome);
  if (row) return row.id;

  const info = db.prepare(`
    INSERT INTO colaboradores (nome, funcao, ativo)
    VALUES (?, ?, 1)
  `).run(nome, funcao);

  return Number(info.lastInsertRowid);
}

function seedEscala2026() {
  let periodo = db.prepare(`
    SELECT id FROM escala_periodos
    WHERE vigencia_inicio='2026-01-05' AND vigencia_fim='2027-01-01'
    LIMIT 1
  `).get();

  if (!periodo) {
    const info = db.prepare(`
      INSERT INTO escala_periodos (titulo, vigencia_inicio, vigencia_fim, regra_texto, intervalo_tecnico, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      "Escala 2026 (Manutenção)",
      "2026-01-05",
      "2027-01-01",
      "Noturno rotativo (Diogo/Salviano/Rodolfo) + 2 diurnos + apoio fixo.",
      "17h–19h"
    );
    periodo = { id: Number(info.lastInsertRowid) };
    console.log("✔ Seed: período 2026 criado");
  }

  const jaTem =
    db.prepare(`SELECT COUNT(*) AS total FROM escala_semanas WHERE periodo_id=?`)
      .get(periodo.id).total || 0;

  if (jaTem > 0) {
    console.log("✔ Seed: escala 2026 já existe (semanas já cadastradas)");
    return;
  }

  const insertSemana = db.prepare(`
    INSERT INTO escala_semanas (periodo_id, semana_numero, data_inicio, data_fim)
    VALUES (?, ?, ?, ?)
  `);

  const insertAloc = db.prepare(`
    INSERT INTO escala_alocacoes (semana_id, tipo_turno, colaborador_id, observacao)
    VALUES (?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const w of ESCALA_2026) {
      const info = insertSemana.run(periodo.id, w.semana, w.inicio, w.fim);
      const semanaId = Number(info.lastInsertRowid);

      const idNoturno = ensureColaborador(w.noturno, "mecanico");
      insertAloc.run(semanaId, "noturno", idNoturno, "Manutenção");

      for (const d of w.diurno) {
        const idD = ensureColaborador(d, "mecanico");
        insertAloc.run(semanaId, "diurno", idD, "Manutenção");
      }

      for (const a of w.apoio) {
        const idA = ensureColaborador(a, "apoio");
        insertAloc.run(semanaId, "apoio", idA, "Manutenção");
      }
    }
  })();

  console.log("✔ Seed: escala 2026 importada (52 semanas)");
}


function seedDesenhoTecnicoBlocos() {
  const modelos = [
    ['Ponta de eixo principal', 'EIXOS', 'PONTA_EIXO_PRINCIPAL', 'Modelo base para eixo principal', { medidaPonta: 90, comprimentoPonta: 120, assento1: 70, comprimentoAssento1: 80, assento2: 50, comprimentoAssento2: 70, encosto: 100, comprimentoTotal: 370, furacoes: 4, espacamento: 40 }],
    ['Ponta de eixo secundária', 'EIXOS', 'PONTA_EIXO_SECUNDARIA', 'Modelo base para eixo secundário', { medidaPonta: 80, comprimentoPonta: 110, assento1: 55, comprimentoTotal: 280 }],
    ['Ponta de eixo de emenda', 'EIXOS', 'PONTA_EIXO_EMENDA', 'Modelo para emenda de eixo', { diametro: 75, comprimentoTotal: 250, insercaoTubo: 65 }],
    ['Flange circular padrão', 'FLANGES', 'FLANGE_CIRCULAR', 'Flange com furação padrão', { diametroExterno: 220, diametroInterno: 120, espessura: 16, numeroFuros: 8, diametroFuros: 16, diametroPrimitivo: 180 }],
    ['Mão francesa padrão', 'ESTRUTURAS', 'MAO_FRANCESA', 'Mão francesa de reforço', { base: 240, altura: 180, espessura: 10, furacoes: 4 }],
    ['Chapa base retangular', 'CHAPARIA', 'CHAPA_RETANGULAR', 'Chapa para base', { largura: 300, altura: 200, espessura: 8 }],
    ['Quadrado para redondo padrão', 'TRANSICOES', 'QUADRADO_REDONDO', 'Transição padrão para duto', { ladoQuadrado: 220, diametro: 180, altura: 250, espessura: 3 }],
  ];

  const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='desenho_blocos'").get();
  if (!hasTable) return;

  const stmt = db.prepare(`
    INSERT INTO desenho_blocos (nome, categoria, subtipo, descricao, definicao_json, ativo, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);

  for (const item of modelos) {
    const exists = db.prepare('SELECT id FROM desenho_blocos WHERE nome=? LIMIT 1').get(item[0]);
    if (exists) continue;
    stmt.run(item[0], item[1], item[2], item[3], JSON.stringify(item[4]));
  }

  console.log('✔ Seed: modelos iniciais de desenho técnico garantidos');
}

function runSeeds() {
  ensureAdmin();
  seedEscala2026();
  seedDesenhoTecnicoBlocos();
}

module.exports = { runSeeds, ensureAdmin, seedEscala2026, seedDesenhoTecnicoBlocos };
