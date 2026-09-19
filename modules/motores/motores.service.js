// /modules/motores/motores.service.js
const db = require("../../database/db");

function normStr(v) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normDate(v) {
  const s = normStr(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function list({ status, origem, q } = {}) {
  let where = "1=1";
  const params = {};

  if (status) {
    where += " AND m.status = @status";
    params.status = String(status).trim().toUpperCase();
  }
  if (origem) {
    where += " AND m.origem_unidade = @origem";
    params.origem = String(origem).trim().toUpperCase();
  }
  if (q) {
    where += " AND (m.codigo LIKE @q OR m.descricao LIKE @q OR m.local_instalacao LIKE @q OR m.empresa_rebob LIKE @q)";
    params.q = `%${String(q).trim()}%`;
  }

  return db
    .prepare(
      `
      SELECT m.*,
             CASE
               WHEN m.status='ENVIADO_REBOB' AND m.data_saida IS NOT NULL
               THEN MAX(0, CAST(julianday('now') - julianday(m.data_saida) AS INTEGER))
               ELSE NULL
             END AS dias_em_rebob,
             CASE
               WHEN m.status='ENVIADO_REBOB'
                    AND m.previsao_retorno IS NOT NULL
                    AND date(m.previsao_retorno) < date('now') THEN 'ATRASADO'
               WHEN m.status='ENVIADO_REBOB'
                    AND m.previsao_retorno IS NOT NULL
                    AND date(m.previsao_retorno) <= date('now', '+7 day') THEN 'PROXIMO'
               WHEN m.status='ENVIADO_REBOB' AND m.previsao_retorno IS NULL THEN 'SEM_PRAZO'
               ELSE 'OK'
             END AS prazo_status
      FROM motores m
      WHERE ${where}
      ORDER BY
        CASE m.status WHEN 'ENVIADO_REBOB' THEN 0 WHEN 'EM_USO' THEN 1 WHEN 'RESERVA' THEN 2 ELSE 3 END,
        datetime(m.updated_at) DESC,
        m.id DESC
    `
    )
    .all(params);
}

function getSummary() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='EM_USO' THEN 1 ELSE 0 END) AS em_uso,
      SUM(CASE WHEN status='RESERVA' THEN 1 ELSE 0 END) AS reserva,
      SUM(CASE WHEN status='ENVIADO_REBOB' THEN 1 ELSE 0 END) AS em_rebob,
      SUM(CASE WHEN status='RETORNOU' THEN 1 ELSE 0 END) AS retornou,
      SUM(CASE
        WHEN status='ENVIADO_REBOB'
         AND previsao_retorno IS NOT NULL
         AND date(previsao_retorno) < date('now')
        THEN 1 ELSE 0 END) AS prazo_atrasado,
      SUM(CASE
        WHEN status='ENVIADO_REBOB'
         AND previsao_retorno IS NULL
        THEN 1 ELSE 0 END) AS sem_prazo
    FROM motores
  `).get() || {};

  const eventos = db.prepare('SELECT COUNT(*) AS total FROM motores_eventos').get()?.total || 0;

  return {
    total: Number(row.total || 0),
    emUso: Number(row.em_uso || 0),
    reserva: Number(row.reserva || 0),
    emRebob: Number(row.em_rebob || 0),
    retornou: Number(row.retornou || 0),
    prazoAtrasado: Number(row.prazo_atrasado || 0),
    semPrazo: Number(row.sem_prazo || 0),
    eventos: Number(eventos || 0),
  };
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
  return db.prepare(`
    SELECT m.*,
           CASE
             WHEN m.status='ENVIADO_REBOB' AND m.data_saida IS NOT NULL
             THEN MAX(0, CAST(julianday('now') - julianday(m.data_saida) AS INTEGER))
             ELSE NULL
           END AS dias_em_rebob,
           CASE
             WHEN m.status='ENVIADO_REBOB'
                  AND m.previsao_retorno IS NOT NULL
                  AND date(m.previsao_retorno) < date('now') THEN 'ATRASADO'
             WHEN m.status='ENVIADO_REBOB'
                  AND m.previsao_retorno IS NOT NULL
                  AND date(m.previsao_retorno) <= date('now', '+7 day') THEN 'PROXIMO'
             WHEN m.status='ENVIADO_REBOB' AND m.previsao_retorno IS NULL THEN 'SEM_PRAZO'
             ELSE 'OK'
           END AS prazo_status
    FROM motores m
    WHERE m.id=?
  `).get(id);
}

function listEventos(motorId) {
  return db
    .prepare(
      `
      SELECT id, motor_id, tipo, empresa_rebob, motorista, previsao_retorno, observacao, created_at
      FROM motores_eventos
      WHERE motor_id=?
      ORDER BY datetime(created_at) DESC, id DESC
    `
    )
    .all(motorId);
}

function registrarEnvio(id, { empresa_rebob, motorista_saida, previsao_retorno, observacao }) {
  const motor = getById(id);
  if (!motor) throw new Error("Motor não encontrado.");
  if (motor.status === "ENVIADO_REBOB") throw new Error("Este motor já está enviado para rebobinamento.");

  const empresa = normStr(empresa_rebob);
  const motorista = normStr(motorista_saida);
  const previsao = normDate(previsao_retorno);
  if (!empresa) throw new Error("Informe a empresa responsável pelo rebobinamento.");
  if (!previsao) throw new Error("Informe a previsão de retorno.");

  db.transaction(() => {
    db.prepare(
      `
      UPDATE motores
      SET status='ENVIADO_REBOB',
          empresa_rebob=@empresa,
          motorista_saida=@motorista,
          data_saida=datetime('now'),
          previsao_retorno=@previsao,
          motorista_retorno=NULL,
          data_retorno=NULL,
          observacao=COALESCE(@obs, observacao),
          updated_at=datetime('now')
      WHERE id=@id
    `
    ).run({ id, empresa, motorista, previsao, obs: normStr(observacao) });

    db.prepare(
      `
      INSERT INTO motores_eventos
        (motor_id, tipo, empresa_rebob, motorista, previsao_retorno, observacao, created_at)
      VALUES
        (@motor_id, 'ENVIAR', @empresa, @motorista, @previsao, @obs, datetime('now'))
    `
    ).run({ motor_id: id, empresa, motorista, previsao, obs: normStr(observacao) });
  })();
}

function registrarRetorno(id, { motorista_retorno, observacao }) {
  const motor = getById(id);
  if (!motor) throw new Error("Motor não encontrado.");
  if (motor.status !== "ENVIADO_REBOB") throw new Error("O retorno só pode ser registrado para motor enviado ao rebobinamento.");

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
      INSERT INTO motores_eventos
        (motor_id, tipo, empresa_rebob, motorista, previsao_retorno, observacao, created_at)
      VALUES
        (@motor_id, 'RETORNO', @empresa, @motorista, @previsao, @obs, datetime('now'))
    `
    ).run({
      motor_id: id,
      empresa: motor.empresa_rebob || null,
      motorista,
      previsao: motor.previsao_retorno || null,
      obs: normStr(observacao),
    });
  })();
}

module.exports = {
  list,
  getSummary,
  create,
  getById,
  listEventos,
  registrarEnvio,
  registrarRetorno,
};
