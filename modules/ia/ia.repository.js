const db = require("../../database/db");
const { safeJSONStringify } = require("./ia.schema");

function tableExists(name) {
  try {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(String(name || ""));
    return !!row;
  } catch (_e) {
    return false;
  }
}

function registrarLogIA({ usuarioId, osId, naoConformidadeId, tipo, entrada, resposta, status }) {
  if (!tableExists("os_ia_logs")) return;
  try {
    db.prepare(
      `INSERT INTO os_ia_logs (usuario_id, os_id, nao_conformidade_id, tipo, entrada_json, resposta_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      usuarioId || null,
      osId || null,
      naoConformidadeId || null,
      tipo,
      safeJSONStringify(entrada),
      safeJSONStringify(resposta),
      status || "OK"
    );
  } catch (_e) {
    // logs não devem quebrar o fluxo principal
  }
}

function buscarHistoricoSemelhante({ equipamentoId, sintoma, descricao, limit = 8 }) {
  const hasOS = tableExists("os");
  if (!hasOS || !equipamentoId) return [];

  const sintomaSafe = String(sintoma || "").trim();
  const descSafe = String(descricao || "").trim();
  const query = `
    SELECT id, equipamento_id, descricao, sintoma_principal, causa_diagnostico, resumo_tecnico, status, opened_at, closed_at
    FROM os
    WHERE equipamento_id = ?
      AND (
        (? <> '' AND UPPER(COALESCE(sintoma_principal,'')) = UPPER(?))
        OR (? <> '' AND UPPER(COALESCE(descricao,'')) LIKE UPPER(?))
        OR (? = '' AND ? = '')
      )
    ORDER BY id DESC
    LIMIT ?
  `;

  try {
    return db.prepare(query).all(
      Number(equipamentoId),
      sintomaSafe,
      sintomaSafe,
      descSafe,
      `%${descSafe}%`,
      sintomaSafe,
      descSafe,
      Number(limit)
    );
  } catch (_e) {
    return [];
  }
}

module.exports = {
  registrarLogIA,
  buscarHistoricoSemelhante,
};
