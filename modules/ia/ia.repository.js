const db = require('../../database/db');

function getOSColumns() {
  try {
    return db.prepare('PRAGMA table_info(os)').all().map((c) => c.name);
  } catch (_e) {
    return [];
  }
}

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, (m) => `\\${m}`);
}

function tokenize(text = '') {
  const words = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 3);

  return [...new Set(words)].slice(0, 12);
}

function buildScoreAndMatch({ equipamentoId, sintomaPrincipal, keywords = [] }) {
  const scoreParts = [];
  const matchParts = [];
  const params = [];

  if (equipamentoId) {
    scoreParts.push('CASE WHEN o.equipamento_id = ? THEN 40 ELSE 0 END');
    matchParts.push('o.equipamento_id = ?');
    params.push(Number(equipamentoId), Number(equipamentoId));
  }

  if (sintomaPrincipal) {
    scoreParts.push("CASE WHEN LOWER(TRIM(COALESCE(o.sintoma_principal,''))) = LOWER(TRIM(?)) THEN 25 ELSE 0 END");
    matchParts.push("LOWER(TRIM(COALESCE(o.sintoma_principal,''))) = LOWER(TRIM(?))");
    params.push(String(sintomaPrincipal), String(sintomaPrincipal));
  }

  for (const keyword of keywords) {
    const expr = `'%${escapeLike(keyword)}%'`;
    scoreParts.push(`CASE WHEN (
      LOWER(COALESCE(o.descricao,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.resumo_tecnico,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_diagnostico_inicial,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_causa_provavel,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_servico_sugerido,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_descricao_tecnica_os,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_acao_corretiva_sugerida,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_acao_preventiva_sugerida,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_observacao_final_tecnica,'')) LIKE LOWER(?) ESCAPE '\\'
    ) THEN 3 ELSE 0 END`);

    matchParts.push(`(
      LOWER(COALESCE(o.descricao,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.resumo_tecnico,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_diagnostico_inicial,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_causa_provavel,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_servico_sugerido,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_descricao_tecnica_os,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_acao_corretiva_sugerida,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_acao_preventiva_sugerida,'')) LIKE LOWER(?) ESCAPE '\\'
      OR LOWER(COALESCE(o.ai_observacao_final_tecnica,'')) LIKE LOWER(?) ESCAPE '\\'
    )`);

    for (let i = 0; i < 9; i += 1) params.push(expr);
    for (let i = 0; i < 9; i += 1) params.push(expr);
  }

  const scoreExpr = scoreParts.length ? scoreParts.join(' + ') : '0';
  const whereExpr = matchParts.length ? matchParts.join(' OR ') : '1=1';

  return { scoreExpr, whereExpr, params };
}

function buscarHistoricoSemelhante({ equipamento_id, sintoma_principal, texto_base, limite = 5 } = {}) {
  const osColumns = getOSColumns();
  if (!osColumns.length) return [];

  const equipamentoId = equipamento_id ? Number(equipamento_id) : null;
  const sintomaPrincipal = String(sintoma_principal || '').trim();
  const keywords = tokenize(`${texto_base || ''} ${sintomaPrincipal}`);
  const { scoreExpr, whereExpr, params } = buildScoreAndMatch({ equipamentoId, sintomaPrincipal, keywords });

  const openedExpr = osColumns.includes('opened_at')
    ? 'o.opened_at'
    : (osColumns.includes('created_at') ? 'o.created_at' : 'NULL');

  const limit = Math.max(1, Math.min(10, Number(limite || 5)));

  return db.prepare(`
    SELECT
      o.id,
      o.equipamento_id,
      COALESCE(o.sintoma_principal, '') AS sintoma_principal,
      COALESCE(o.status, '') AS status,
      COALESCE(o.descricao, '') AS descricao,
      COALESCE(o.resumo_tecnico, '') AS resumo_tecnico,
      COALESCE(o.causa_diagnostico, '') AS causa_diagnostico,
      COALESCE(o.ai_diagnostico_inicial, '') AS ai_diagnostico_inicial,
      COALESCE(o.ai_causa_provavel, '') AS ai_causa_provavel,
      COALESCE(o.ai_servico_sugerido, '') AS ai_servico_sugerido,
      COALESCE(o.ai_acao_corretiva_sugerida, '') AS ai_acao_corretiva_sugerida,
      COALESCE(o.ai_acao_preventiva_sugerida, '') AS ai_acao_preventiva_sugerida,
      COALESCE(o.ai_descricao_tecnica_os, '') AS ai_descricao_tecnica_os,
      ${openedExpr} AS opened_at,
      (${scoreExpr}) AS score_similaridade
    FROM os o
    WHERE (${whereExpr})
    ORDER BY score_similaridade DESC, o.id DESC
    LIMIT ${limit}
  `).all(...params);
}

module.exports = {
  buscarHistoricoSemelhante,
};
