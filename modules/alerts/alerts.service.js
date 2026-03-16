const db = require('../../database/db');

function safeGet(fn, fallback) {
  try { return fn(); } catch (_e) { return fallback; }
}

function resolveGrauExpr(alias = 'o') {
  const cols = safeGet(() => db.prepare('PRAGMA table_info(os)').all(), []);
  const names = new Set(cols.map((c) => c.name));
  if (names.has('grau')) return `COALESCE(${alias}.grau, '-')`;
  if (names.has('grau_dificuldade')) return `COALESCE(${alias}.grau_dificuldade, '-')`;
  if (names.has('nivel_grau')) return `COALESCE(${alias}.nivel_grau, '-')`;
  // TODO: trocar para o campo oficial de grau da OS quando definido em todos ambientes.
  return `COALESCE(${alias}.prioridade, 'MEDIA')`;
}

function getAlertaAtivo() {
  return safeGet(() => db.prepare(`
    SELECT o.id AS os_id, o.equipamento, o.descricao, o.prioridade, ${resolveGrauExpr('o')} AS grau, o.opened_at,
           COALESCE(e.setor,'') AS setor,
           COALESCE(c.nivel_criticidade,'N/D') AS criticidade
    FROM os o
    LEFT JOIN equipamentos e ON e.id = o.equipamento_id
    LEFT JOIN pcm_equipamento_criticidade c ON c.equipamento_id = o.equipamento_id
    WHERE UPPER(COALESCE(o.status,'')) IN ('ABERTA','ANDAMENTO','PAUSADA')
      AND UPPER(COALESCE(o.prioridade,''))='EMERGENCIAL'
      AND NOT EXISTS (
        SELECT 1 FROM os_alertas_reconhecimentos r
        WHERE r.os_id = o.id
      )
    ORDER BY datetime(o.opened_at) DESC, o.id DESC
    LIMIT 1
  `).get(), null);
}

function marcarNotificacoesReconhecidas(osId, userId) {
  try {
    db.prepare(`
      UPDATE notificacoes_os
      SET lida = 1, reconhecida = 1, reconhecida_em = datetime('now'), status = 'RECONHECIDA'
      WHERE os_id = ?
    `).run(Number(osId));
  } catch (_e) {}

  if (userId) {
    try {
      db.prepare(`
        UPDATE notificacoes_os
        SET lida = 1
        WHERE os_id = ? AND user_id = ?
      `).run(Number(osId), Number(userId));
    } catch (_e) {}
  }
}

function reconhecerAlerta({ os_id, user_id, observacao }) {
  const osId = Number(os_id);
  if (!osId) throw new Error('OS inválida para reconhecimento.');

  const os = db.prepare(`SELECT id, prioridade FROM os WHERE id=?`).get(osId);
  if (!os) throw new Error('OS não encontrada.');

  db.prepare(`
    INSERT INTO os_alertas_reconhecimentos (os_id, prioridade, reconhecido_por, observacao, reconhecido_em)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(osId, os.prioridade || null, user_id || null, observacao || null);

  marcarNotificacoesReconhecidas(osId, user_id || null);

  return { ok: true, os_id: osId };
}

function buildEventoFromOS(osId) {
  return safeGet(() => db.prepare(`
    SELECT o.id AS id_os, o.equipamento, o.descricao AS texto_resumido,
           COALESCE(o.prioridade,'MEDIA') AS prioridade,
           o.status,
           ${resolveGrauExpr('o')} AS grau,
           o.opened_at AS hora_abertura,
           COALESCE(e.setor,'') AS setor,
           COALESCE(c.nivel_criticidade,'N/D') AS criticidade
    FROM os o
    LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    LEFT JOIN pcm_equipamento_criticidade c ON c.equipamento_id=o.equipamento_id
    WHERE o.id=?
  `).get(Number(osId)), null);
}

module.exports = { getAlertaAtivo, reconhecerAlerta, buildEventoFromOS, marcarNotificacoesReconhecidas };
