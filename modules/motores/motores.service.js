// /modules/motores/motores.service.js
const db = require("../../database/db");

function normStr(v) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function list({ status, origem, q } = {}) {
  let where = "1=1";
  const params = {};

  if (status) {
    where += " AND status = @status";
    params.status = String(status).trim().toUpperCase();
  }
  if (origem) {
    where += " AND origem_unidade = @origem";
    params.origem = String(origem).trim().toUpperCase();
  }
  if (q) {
    where += " AND (codigo LIKE @q OR descricao LIKE @q OR local_instalacao LIKE @q)";
    params.q = `%${String(q).trim()}%`;
  }

  return db
    .prepare(
      `
      SELECT *
      FROM motores
      WHERE ${where}
      ORDER BY datetime(created_at) DESC
    `
    )
    .all(params);
}

function create(body) {
  const codigo = normStr(body.codigo);
  const descricao = normStr(body.descricao);
  if (!descricao) throw new Error("Descrição é obrigatória.");

  const potencia_cv = body.potencia_cv !== undefined && body.potencia_cv !== "" ? Number(body.potencia_cv) : null;
  const rpm = body.rpm !== undefined && body.rpm !== "" ? Number(body.rpm) : null;

  const origem_unidade = normStr(body.origem_unidade)?.toUpperCase() || "RECICLAGEM";
  const local_instalacao = normStr(body.local_instalacao);
  const status = normStr(body.status)?.toUpperCase() || "EM_USO";
  const observacao = normStr(body.observacao);

  const info = db
    .prepare(
      `
      INSERT INTO motores (
        codigo, descricao, potencia_cv, rpm, origem_unidade, local_instalacao,
        status, observacao, created_at, updated_at
      ) VALUES (
        @codigo, @descricao, @potencia_cv, @rpm, @origem_unidade, @local_instalacao,
        @status, @observacao, datetime('now'), datetime('now')
      )
    `
    )
    .run({
      codigo,
      descricao,
      potencia_cv,
      rpm,
      origem_unidade,
      local_instalacao,
      status,
      observacao,
    });

  return Number(info.lastInsertRowid);
}

function getById(id) {
  return db.prepare(`SELECT * FROM motores WHERE id=?`).get(id);
}

function listEventos(motorId) {
  return db
    .prepare(
      `
      SELECT *
      FROM motores_eventos
      WHERE motor_id=?
      ORDER BY datetime(created_at) DESC
    `
    )
    .all(motorId);
}

function registrarEnvio(id, { empresa_rebob, motorista_saida, observacao }) {
  const motor = getById(id);
  if (!motor) throw new Error("Motor não encontrado.");

  const empresa = normStr(empresa_rebob);
  const motorista = normStr(motorista_saida);

  db.transaction(() => {
    db.prepare(
      `
      UPDATE motores
      SET status='ENVIADO_REBOB',
          empresa_rebob=@empresa,
          motorista_saida=@motorista,
          data_saida=datetime('now'),
          observacao=COALESCE(@obs, observacao),
          updated_at=datetime('now')
      WHERE id=@id
    `
    ).run({ id, empresa, motorista, obs: normStr(observacao) });

    db.prepare(
      `
      INSERT INTO motores_eventos (motor_id, tipo, empresa_rebob, motorista, observacao, created_at)
      VALUES (@motor_id, 'ENVIAR', @empresa, @motorista, @obs, datetime('now'))
    `
    ).run({ motor_id: id, empresa, motorista, obs: normStr(observacao) });
  })();
}

function registrarRetorno(id, { motorista_retorno, observacao }) {
  const motor = getById(id);
  if (!motor) throw new Error("Motor não encontrado.");

  const motorista = normStr(motorista_retorno);

  db.transaction(() => {
    db.prepare(
      `
      UPDATE motores
      SET status='RETORNOU',
          motorista_retorno=@motorista,
          data_retorno=datetime('now'),
          observacao=COALESCE(@obs, observacao),
          updated_at=datetime('now')
      WHERE id=@id
    `
    ).run({ id, motorista, obs: normStr(observacao) });

    db.prepare(
      `
      INSERT INTO motores_eventos (motor_id, tipo, empresa_rebob, motorista, observacao, created_at)
      VALUES (@motor_id, 'RETORNO', NULL, @motorista, @obs, datetime('now'))
    `
    ).run({ motor_id: id, motorista, obs: normStr(observacao) });
  })();
}

module.exports = {
  list,
  create,
  getById,
  listEventos,
  registrarEnvio,
  registrarRetorno,
};
