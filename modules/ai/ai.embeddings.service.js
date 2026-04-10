const crypto = require('crypto');
const db = require('../../database/db');

const EMBEDDING_DIM = 48;

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name || ''));
  } catch (_e) {
    return false;
  }
}

function tokenize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toVector(text) {
  const vector = new Array(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const hash = crypto.createHash('sha256').update(token).digest();
    for (let i = 0; i < EMBEDDING_DIM; i += 1) {
      const b = hash[i % hash.length];
      vector[i] += ((b / 255) * 2) - 1;
    }
  }
  const norm = Math.sqrt(vector.reduce((acc, n) => acc + (n * n), 0)) || 1;
  return vector.map((n) => Number((n / norm).toFixed(6)));
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = Number(a[i] || 0);
    const vb = Number(b[i] || 0);
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  const den = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / den;
}

function parseEmbedding(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map((n) => Number(n || 0)) : null;
  } catch (_e) {
    return null;
  }
}

function buildOSText(os) {
  return [os?.descricao, os?.sintoma_principal, os?.causa_diagnostico, os?.resumo_tecnico, os?.ai_diagnostico, os?.ai_sugestao]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' | ');
}

function updateOSEmbedding(osId) {
  if (!tableExists('os')) return null;
  const row = db.prepare(`SELECT * FROM os WHERE id = ? LIMIT 1`).get(Number(osId));
  if (!row) return null;
  const text = buildOSText(row);
  const vector = toVector(text);
  try {
    db.prepare(`UPDATE os SET ai_embedding = ? WHERE id = ?`).run(JSON.stringify(vector), Number(osId));
  } catch (_e) {}
  return vector;
}

function updateEquipamentoEmbedding(equipamentoId) {
  if (!tableExists('equipamentos')) return null;
  const row = db.prepare(`SELECT * FROM equipamentos WHERE id = ? LIMIT 1`).get(Number(equipamentoId));
  if (!row) return null;
  const text = [row.nome, row.tipo, row.setor, row.observacao].filter(Boolean).join(' | ');
  const vector = toVector(text);
  try {
    db.prepare(`UPDATE equipamentos SET embedding = ? WHERE id = ?`).run(JSON.stringify(vector), Number(equipamentoId));
  } catch (_e) {}
  return vector;
}

function updatePreventivaEmbedding(planoId) {
  if (!tableExists('preventiva_planos')) return null;
  const row = db.prepare(`SELECT * FROM preventiva_planos WHERE id = ? LIMIT 1`).get(Number(planoId));
  if (!row) return null;
  const text = [row.titulo, row.observacao, row.frequencia_tipo, row.prioridade].filter(Boolean).join(' | ');
  const vector = toVector(text);
  try {
    db.prepare(`UPDATE preventiva_planos SET embedding = ? WHERE id = ?`).run(JSON.stringify(vector), Number(planoId));
  } catch (_e) {}
  return vector;
}

function buscarOSSimilares({ osId = null, equipamentoId = null, texto = '', limit = 5 } = {}) {
  if (!tableExists('os')) return [];
  let queryVector = null;
  if (osId) {
    const current = db.prepare(`SELECT ai_embedding, descricao, sintoma_principal FROM os WHERE id = ? LIMIT 1`).get(Number(osId));
    queryVector = parseEmbedding(current?.ai_embedding) || toVector(buildOSText(current || {}));
    if (!texto) texto = [current?.descricao, current?.sintoma_principal].filter(Boolean).join(' ');
  }
  if (!queryVector) queryVector = toVector(texto);

  const rows = db.prepare(`
    SELECT id, equipamento_id, descricao, sintoma_principal, causa_diagnostico, resumo_tecnico, ai_diagnostico, ai_sugestao, ai_embedding, opened_at
    FROM os
    WHERE (? IS NULL OR equipamento_id = ?)
      AND (? IS NULL OR id <> ?)
    ORDER BY id DESC
    LIMIT 200
  `).all(equipamentoId ? Number(equipamentoId) : null, equipamentoId ? Number(equipamentoId) : null, osId ? Number(osId) : null, osId ? Number(osId) : null);

  return rows
    .map((row) => {
      const vector = parseEmbedding(row.ai_embedding) || toVector(buildOSText(row));
      return {
        ...row,
        score_similaridade: Number(cosineSimilarity(queryVector, vector).toFixed(4)),
      };
    })
    .sort((a, b) => b.score_similaridade - a.score_similaridade)
    .slice(0, Math.max(1, Number(limit || 5)));
}

function rankingFalhasEquipamentos({ dias = 90, limit = 10 } = {}) {
  if (!tableExists('os')) return [];
  const rows = db.prepare(`
    SELECT o.equipamento_id,
           COALESCE(e.nome, o.equipamento, 'Sem equipamento') AS equipamento,
           COUNT(*) AS total_falhas,
           SUM(CASE WHEN UPPER(COALESCE(o.prioridade, o.grau, 'MEDIA')) IN ('ALTA','CRITICA','CRÍTICA') THEN 1 ELSE 0 END) AS falhas_criticas,
           GROUP_CONCAT(DISTINCT COALESCE(o.sintoma_principal, 'SEM_SINTOMA')) AS sintomas
    FROM os o
    LEFT JOIN equipamentos e ON e.id = o.equipamento_id
    WHERE datetime(COALESCE(o.opened_at, datetime('now'))) >= datetime('now', ?)
    GROUP BY o.equipamento_id, equipamento
    ORDER BY total_falhas DESC, falhas_criticas DESC
    LIMIT ?
  `).all(`-${Number(dias || 90)} days`, Number(limit || 10));

  return rows.map((row, idx) => ({
    ranking: idx + 1,
    equipamento_id: row.equipamento_id,
    equipamento: row.equipamento,
    total_falhas: Number(row.total_falhas || 0),
    falhas_criticas: Number(row.falhas_criticas || 0),
    sintomas: String(row.sintomas || '').split(',').filter(Boolean),
    equipamento_mais_critico: idx === 0,
  }));
}

function preverFalhasEAlertas({ dias = 30 } = {}) {
  if (!tableExists('os')) return [];
  const rows = db.prepare(`
    SELECT equipamento_id, COALESCE(e.nome, o.equipamento, 'Sem equipamento') AS equipamento,
           COUNT(*) AS total,
           SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('ABERTA','ANDAMENTO','EM_ANDAMENTO') THEN 1 ELSE 0 END) AS abertas
    FROM os o
    LEFT JOIN equipamentos e ON e.id = o.equipamento_id
    WHERE datetime(COALESCE(o.opened_at, datetime('now'))) >= datetime('now', ?)
    GROUP BY equipamento_id, equipamento
    HAVING COUNT(*) >= 3
    ORDER BY total DESC
  `).all(`-${Number(dias || 30)} days`);

  return rows.map((row) => ({
    equipamento_id: row.equipamento_id,
    equipamento: row.equipamento,
    probabilidade_falha: Math.min(0.95, Number((0.35 + (Number(row.total || 0) * 0.08)).toFixed(2))),
    sugestao: `Abrir preventiva focada no equipamento ${row.equipamento} e revisar causas repetitivas.`,
    total_eventos_periodo: Number(row.total || 0),
    os_abertas: Number(row.abertas || 0),
  }));
}

module.exports = {
  toVector,
  cosineSimilarity,
  updateOSEmbedding,
  updateEquipamentoEmbedding,
  updatePreventivaEmbedding,
  buscarOSSimilares,
  rankingFalhasEquipamentos,
  preverFalhasEAlertas,
};
