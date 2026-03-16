const db = require("../db");

// cria colaboradores a partir de usuários com perfil MECANICO / ALMOXARIFADO
function ensureColaboradoresFromUsers() {
  const users = db
    .prepare("SELECT id, name, role FROM users WHERE role IN ('MECANICO','ALMOXARIFADO')")
    .all();

  const findColab = db.prepare("SELECT id FROM colaboradores WHERE user_id = ?");
  const insert = db.prepare(
    "INSERT INTO colaboradores (nome, funcao, ativo, user_id) VALUES (?, ?, 1, ?)"
  );

  let created = 0;

  for (const u of users) {
    const exists = findColab.get(u.id);
    if (exists) continue;

    const funcao = u.role === "ALMOXARIFADO" ? "almoxarifado" : "mecanico";
    insert.run(u.name, funcao, u.id);
    created++;
  }

  if (created) console.log(`✔ Seed escala: ${created} colaboradores criados a partir de users.`);
}

module.exports = { ensureColaboradoresFromUsers };
