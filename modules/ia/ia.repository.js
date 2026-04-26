const db = require("../../database/db");
const { safeJSONStringify } = require("./ia.schema");
const aiEmbeddingsService = require("../ai/ai.embeddings.service");

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

function registrarLogIA({ usuarioId, osId, naoConformidadeId, tipo, entrada, resposta, status, tempoMs = null, erro = null }) {
  try {
    if (tableExists("os_ia_logs")) {
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
    }

    if (tableExists("ai_logs")) {
      db.prepare(
        `INSERT INTO ai_logs (usuario_id, os_id, tipo, entrada, resposta, tempo_ms, erro)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        usuarioId || null,
        osId || null,
        tipo || null,
        safeJSONStringify(entrada),
        safeJSONStringify(resposta),
        tempoMs != null ? Number(tempoMs) : null,
        erro ? String(erro) : null
      );
    }
  } catch (_e) {
    // logs não devem quebrar o fluxo principal
  }
}

function buscarHistoricoSemelhante(params = {}) {
  const equipamentoId = params.equipamentoId ?? params.equipamento_id ?? null;
  const sintoma = params.sintoma ?? params.sintoma_principal ?? '';
  const descricao = params.descricao ?? params.texto_base ?? '';
  const limit = params.limit ?? params.limite ?? 8;
  const hasOS = tableExists("os");
  if (!hasOS || !equipamentoId) return [];

  try {
    const semelhantes = aiEmbeddingsService.buscarOSSimilares({
      equipamentoId: Number(equipamentoId),
      texto: [sintoma, descricao].filter(Boolean).join(' '),
      limit: Number(limit),
    });
    if (semelhantes.length) return semelhantes;
  } catch (_e) {}

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
