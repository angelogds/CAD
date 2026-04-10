const crypto = require('crypto');
const db = require('../../database/db');
const { getAIConfig } = require('./ai.service');

const FALLBACK_DIM = 96;

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name || ''));
  } catch (_e) {
    return false;
  }
}

function normalizeText(value) {
  return String(value || '').trim();
}

function tokenize(text) {
  return normalizeText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fallbackEmbedding(text) {
  const vector = new Array(FALLBACK_DIM).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const hash = crypto.createHash('sha256').update(token).digest();
    for (let i = 0; i < FALLBACK_DIM; i += 1) {
      const byte = hash[i % hash.length];
      vector[i] += ((byte / 255) * 2) - 1;
    }
  }
  const norm = Math.sqrt(vector.reduce((acc, n) => acc + (n * n), 0)) || 1;
  return vector.map((n) => Number((n / norm).toFixed(8)));
}

async function callOpenAIEmbedding(text) {
  const cfg = getAIConfig();
  if (!cfg.enabled || !cfg.hasApiKey || cfg.apiKeyLooksPlaceholder) return null;

  const embeddingModel = String(process.env.OPENAI_MODEL_EMBEDDINGS || 'text-embedding-3-small').trim();
  const timeoutMs = Number(process.env.OPENAI_EMBEDDINGS_TIMEOUT_MS || cfg.timeoutMs || 20000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: embeddingModel,
        input: normalizeText(text).slice(0, 12000),
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding.map((n) => Number(n || 0)) : null;
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateEmbedding(text) {
  const clean = normalizeText(text);
  if (!clean) return [];
  const openAIEmbedding = await callOpenAIEmbedding(clean);
  if (openAIEmbedding && openAIEmbedding.length) return openAIEmbedding;
  return fallbackEmbedding(clean);
}

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || !vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    const a = Number(vecA[i] || 0);
    const b = Number(vecB[i] || 0);
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator ? dot / denominator : 0;
}

function parseEmbedding(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map((n) => Number(n || 0)) : null;
  } catch (_e) {
    return null;
  }
}

function buildOSText(os) {
  return [
    os?.descricao,
    os?.nao_conformidade,
    os?.sintoma_principal,
    os?.causa_diagnostico,
    os?.resumo_tecnico,
    os?.ai_diagnostico,
    os?.ai_sugestao,
    os?.ai_analise_completa,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' | ');
}

function buildEquipamentoText(eq) {
  return [
    eq?.nome,
    eq?.tipo,
    eq?.setor,
    eq?.fabricante,
    eq?.modelo,
    eq?.tag,
    eq?.observacao,
    eq?.ai_recomendacoes,
    eq?.ai_risco_operacional,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' | ');
}

function upsertIndexRow({ entidadeTipo, entidadeId, textoBase, embedding, metadata }) {
  if (!tableExists('ai_embeddings_index')) return;
  const insert = db.prepare(`
    INSERT INTO ai_embeddings_index (entidade_tipo, entidade_id, texto_base, metadata_json, vetor_json, modelo, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(entidade_tipo, entidade_id) DO UPDATE SET
      texto_base = excluded.texto_base,
      metadata_json = excluded.metadata_json,
      vetor_json = excluded.vetor_json,
      modelo = excluded.modelo,
      atualizado_em = datetime('now')
  `);
  insert.run(
    String(entidadeTipo || ''),
    Number(entidadeId),
    normalizeText(textoBase),
    JSON.stringify(metadata || {}),
    JSON.stringify(embedding || []),
    String(process.env.OPENAI_MODEL_EMBEDDINGS || 'text-embedding-3-small')
  );
}

async function indexOS(osId) {
  if (!tableExists('os')) return null;
  const row = db.prepare('SELECT * FROM os WHERE id = ? LIMIT 1').get(Number(osId));
  if (!row) return null;

  const textoBase = buildOSText(row);
  if (!textoBase) return null;

  const embedding = await generateEmbedding(textoBase);
  upsertIndexRow({
    entidadeTipo: 'os',
    entidadeId: Number(osId),
    textoBase,
    embedding,
    metadata: {
      equipamento_id: row.equipamento_id || null,
      status: row.status || null,
      prioridade: row.prioridade || row.grau || null,
      opened_at: row.opened_at || null,
    },
  });

  if (tableExists('os')) {
    try { db.prepare('UPDATE os SET ai_embedding = ? WHERE id = ?').run(JSON.stringify(embedding), Number(osId)); } catch (_e) {}
  }

  return embedding;
}

async function indexEquipamento(equipamentoId) {
  if (!tableExists('equipamentos')) return null;
  const row = db.prepare('SELECT * FROM equipamentos WHERE id = ? LIMIT 1').get(Number(equipamentoId));
  if (!row) return null;

  const textoBase = buildEquipamentoText(row);
  if (!textoBase) return null;

  const embedding = await generateEmbedding(textoBase);
  upsertIndexRow({
    entidadeTipo: 'equipamento',
    entidadeId: Number(equipamentoId),
    textoBase,
    embedding,
    metadata: {
      setor: row.setor || null,
      tipo: row.tipo || null,
    },
  });

  try { db.prepare('UPDATE equipamentos SET embedding = ? WHERE id = ?').run(JSON.stringify(embedding), Number(equipamentoId)); } catch (_e) {}
  return embedding;
}

async function searchSimilarOS(query, options = {}) {
  if (!tableExists('ai_embeddings_index') || !tableExists('os')) return [];
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 20));
  const equipmentId = Number(options.equipamentoId || 0) || null;
  const threshold = Number(options.minScore || 0.45);

  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding.length) return [];

  const rows = db.prepare(`
    SELECT idx.entidade_id AS os_id, idx.vetor_json, idx.metadata_json,
           o.descricao, o.sintoma_principal, o.status, o.opened_at, o.closed_at, o.equipamento_id
    FROM ai_embeddings_index idx
    JOIN os o ON o.id = idx.entidade_id
    WHERE idx.entidade_tipo = 'os'
      AND (? IS NULL OR o.equipamento_id = ?)
    ORDER BY idx.atualizado_em DESC
    LIMIT 400
  `).all(equipmentId, equipmentId);

  return rows
    .map((row) => {
      const emb = parseEmbedding(row.vetor_json);
      const score = emb ? cosineSimilarity(queryEmbedding, emb) : 0;
      return {
        os_id: row.os_id,
        equipamento_id: row.equipamento_id,
        descricao: row.descricao,
        sintoma_principal: row.sintoma_principal,
        status: row.status,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        score_similaridade: Number(score.toFixed(4)),
        metadata: (() => {
          try { return JSON.parse(String(row.metadata_json || '{}')); } catch (_e) { return {}; }
        })(),
      };
    })
    .filter((r) => r.score_similaridade >= threshold)
    .sort((a, b) => b.score_similaridade - a.score_similaridade)
    .slice(0, limit);
}

async function searchSimilarByOS(osId, options = {}) {
  const row = tableExists('os')
    ? db.prepare('SELECT id, equipamento_id, descricao, sintoma_principal FROM os WHERE id = ? LIMIT 1').get(Number(osId))
    : null;
  if (!row) return [];
  const queryText = [row.descricao, row.sintoma_principal].filter(Boolean).join(' ');
  const matches = await searchSimilarOS(queryText, {
    ...options,
    equipamentoId: options.equipamentoId || row.equipamento_id || null,
    limit: options.limit || 6,
  });
  return matches.filter((item) => Number(item.os_id) !== Number(osId));
}

async function reindexAllOS(batchSize = 50) {
  if (!tableExists('os')) return { total: 0, indexed: 0 };
  const size = Math.max(1, Math.min(Number(batchSize || 50), 250));
  const rows = db.prepare('SELECT id FROM os ORDER BY id DESC').all();

  let indexed = 0;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    for (const row of chunk) {
      const emb = await indexOS(row.id);
      if (emb && emb.length) indexed += 1;
    }
  }

  return { total: rows.length, indexed };
}

function rankingFalhasEquipamentos({ dias = 90, limit = 10 } = {}) {
  if (!tableExists('os')) return [];
  return db.prepare(`
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
  `).all(`-${Number(dias || 90)} days`, Number(limit || 10)).map((row, idx) => ({
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
  return db.prepare(`
    SELECT equipamento_id, COALESCE(e.nome, o.equipamento, 'Sem equipamento') AS equipamento,
           COUNT(*) AS total,
           SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('ABERTA','ANDAMENTO','EM_ANDAMENTO') THEN 1 ELSE 0 END) AS abertas
    FROM os o
    LEFT JOIN equipamentos e ON e.id = o.equipamento_id
    WHERE datetime(COALESCE(o.opened_at, datetime('now'))) >= datetime('now', ?)
    GROUP BY equipamento_id, equipamento
    HAVING COUNT(*) >= 3
    ORDER BY total DESC
  `).all(`-${Number(dias || 30)} days`).map((row) => ({
    equipamento_id: row.equipamento_id,
    equipamento: row.equipamento,
    probabilidade_falha: Math.min(0.95, Number((0.35 + (Number(row.total || 0) * 0.08)).toFixed(2))),
    sugestao: `Abrir preventiva focada no equipamento ${row.equipamento} e revisar causas repetitivas.`,
    total_eventos_periodo: Number(row.total || 0),
    os_abertas: Number(row.abertas || 0),
  }));
}

function buscarOSSimilares({ osId = null, equipamentoId = null, texto = '', limit = 5 } = {}) {
  if (!tableExists('os')) return [];
  const cap = Math.max(1, Math.min(Number(limit || 5), 20));
  const eq = Number(equipamentoId || 0) || null;

  let queryVector = null;
  let osIdNum = Number(osId || 0) || null;
  if (osIdNum) {
    const current = db.prepare('SELECT id, ai_embedding, descricao, sintoma_principal FROM os WHERE id = ? LIMIT 1').get(osIdNum);
    queryVector = parseEmbedding(current?.ai_embedding) || fallbackEmbedding([current?.descricao, current?.sintoma_principal].filter(Boolean).join(' '));
    texto = texto || [current?.descricao, current?.sintoma_principal].filter(Boolean).join(' ');
  }
  if (!queryVector) queryVector = fallbackEmbedding(texto);

  const rows = db.prepare(`
    SELECT id, equipamento_id, descricao, sintoma_principal, causa_diagnostico, resumo_tecnico, ai_diagnostico, ai_sugestao, ai_embedding, opened_at
    FROM os
    WHERE (? IS NULL OR equipamento_id = ?)
      AND (? IS NULL OR id <> ?)
    ORDER BY id DESC
    LIMIT 300
  `).all(eq, eq, osIdNum, osIdNum);

  return rows.map((row) => {
    const vector = parseEmbedding(row.ai_embedding) || fallbackEmbedding(buildOSText(row));
    return { ...row, score_similaridade: Number(cosineSimilarity(queryVector, vector).toFixed(4)) };
  }).sort((a, b) => b.score_similaridade - a.score_similaridade).slice(0, cap);
}

function updateOSEmbedding(osId) {
  return indexOS(osId);
}

function updateEquipamentoEmbedding(equipamentoId) {
  return indexEquipamento(equipamentoId);
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  indexOS,
  indexEquipamento,
  searchSimilarOS,
  searchSimilarByOS,
  reindexAllOS,
  rankingFalhasEquipamentos,
  preverFalhasEAlertas,
  buscarOSSimilares,
  updateOSEmbedding,
  updateEquipamentoEmbedding,
};
