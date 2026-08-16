const db = require('../../database/db');
const embeddings = require('./ai.embeddings.service');
const {
  normalizeMemoryText,
  hashContent,
  chunkText,
  flattenJsonText,
  lexicalScore,
} = require('./industrial-assistant.memory.utils');

const SOURCE_TYPES = {
  OS_DOCUMENTO: 'OS_DOCUMENTO',
  ACADEMIA_BIBLIOTECA: 'ACADEMIA_BIBLIOTECA',
  EQUIPAMENTO_DOCUMENTO: 'EQUIPAMENTO_DOCUMENTO',
};

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name || '')); } catch (_e) { return false; }
}

function memoryReady() {
  return tableExists('ai_memory_chunks');
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(String(value || '')); } catch (_e) { return fallback; }
}

function vectorFromJson(value) {
  const parsed = safeJson(value, null);
  return Array.isArray(parsed) && parsed.length ? parsed.map(Number) : null;
}

function embeddingModel() {
  return String(process.env.OPENAI_MODEL_EMBEDDINGS || 'text-embedding-3-small').trim();
}

function sourceExists(sourceType, sourceId) {
  const id = Number(sourceId || 0);
  if (!id) return false;
  if (sourceType === SOURCE_TYPES.OS_DOCUMENTO) {
    return tableExists('ordem_servico_documentos') && !!db.prepare('SELECT 1 FROM ordem_servico_documentos WHERE id=? LIMIT 1').get(id);
  }
  if (sourceType === SOURCE_TYPES.ACADEMIA_BIBLIOTECA) {
    return tableExists('academia_biblioteca') && !!db.prepare('SELECT 1 FROM academia_biblioteca WHERE id=? LIMIT 1').get(id);
  }
  if (sourceType === SOURCE_TYPES.EQUIPAMENTO_DOCUMENTO) {
    return tableExists('documentos_equipamento') && !!db.prepare('SELECT 1 FROM documentos_equipamento WHERE id=? LIMIT 1').get(id);
  }
  return false;
}

async function prepareChunks({ sourceType, sourceId, title, content, metadata = {}, sourceUpdatedAt = null } = {}) {
  const normalized = normalizeMemoryText(content);
  const pieces = chunkText(normalized, { maxChars: 1000, overlapChars: 150 });
  const existing = memoryReady()
    ? db.prepare('SELECT chunk_key,content_hash,embedding_json,embedding_model FROM ai_memory_chunks WHERE source_type=? AND source_id=?').all(sourceType, Number(sourceId))
    : [];
  const existingByKey = new Map(existing.map((row) => [String(row.chunk_key), row]));
  const prepared = [];

  for (let index = 0; index < pieces.length; index += 1) {
    const chunkKey = `chunk-${String(index + 1).padStart(4, '0')}`;
    const text = pieces[index];
    const contentHash = hashContent(text);
    const previous = existingByKey.get(chunkKey);
    let embeddingJson = previous?.content_hash === contentHash ? previous.embedding_json : null;
    let model = previous?.content_hash === contentHash ? previous.embedding_model : null;
    if (!embeddingJson) {
      const vector = await embeddings.generateEmbedding(text);
      embeddingJson = JSON.stringify(vector || []);
      model = embeddingModel();
    }
    prepared.push({
      sourceType,
      sourceId: Number(sourceId),
      chunkKey,
      title: normalizeMemoryText(title).slice(0, 300) || null,
      content: text,
      contentHash,
      metadataJson: JSON.stringify(metadata || {}),
      embeddingJson,
      embeddingModel: model || embeddingModel(),
      sourceUpdatedAt: sourceUpdatedAt || null,
    });
  }
  return prepared;
}

async function upsertSource(source = {}) {
  if (!memoryReady()) return { ok: false, skipped: true, reason: 'missing_ai_memory_chunks' };
  const sourceType = String(source.sourceType || '').trim();
  const sourceId = Number(source.sourceId || 0);
  if (!Object.values(SOURCE_TYPES).includes(sourceType) || !sourceId) {
    return { ok: false, skipped: true, reason: 'invalid_source' };
  }

  const prepared = await prepareChunks(source);
  const keys = new Set(prepared.map((item) => item.chunkKey));
  const tx = db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO ai_memory_chunks
        (source_type,source_id,chunk_key,title,content,content_hash,metadata_json,embedding_json,embedding_model,source_updated_at,indexed_at,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),1)
      ON CONFLICT(source_type,source_id,chunk_key) DO UPDATE SET
        title=excluded.title,
        content=excluded.content,
        content_hash=excluded.content_hash,
        metadata_json=excluded.metadata_json,
        embedding_json=excluded.embedding_json,
        embedding_model=excluded.embedding_model,
        source_updated_at=excluded.source_updated_at,
        indexed_at=datetime('now'),
        active=1
    `);
    for (const item of prepared) {
      upsert.run(
        item.sourceType, item.sourceId, item.chunkKey, item.title, item.content, item.contentHash,
        item.metadataJson, item.embeddingJson, item.embeddingModel, item.sourceUpdatedAt,
      );
    }
    const current = db.prepare('SELECT chunk_key FROM ai_memory_chunks WHERE source_type=? AND source_id=?').all(sourceType, sourceId);
    const deactivate = db.prepare('UPDATE ai_memory_chunks SET active=0,indexed_at=datetime(\'now\') WHERE source_type=? AND source_id=? AND chunk_key=?');
    current.forEach((row) => { if (!keys.has(String(row.chunk_key))) deactivate.run(sourceType, sourceId, row.chunk_key); });
  });
  tx();
  return { ok: true, source_type: sourceType, source_id: sourceId, chunks: prepared.length };
}

function osDocumentSources(limit = 100) {
  if (!tableExists('ordem_servico_documentos')) return [];
  return db.prepare(`
    SELECT id,os_id,tipo_documento,numero_os,conteudo_ia_json,pdf_url,status,criado_em,atualizado_em
    FROM ordem_servico_documentos
    ORDER BY datetime(COALESCE(atualizado_em,criado_em)) DESC,id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    sourceType: SOURCE_TYPES.OS_DOCUMENTO,
    sourceId: row.id,
    title: `OS ${row.numero_os || row.os_id || row.id} • ${row.tipo_documento || 'Documento institucional'}`,
    content: flattenJsonText(row.conteudo_ia_json),
    metadata: { os_id: row.os_id || null, numero_os: row.numero_os || null, tipo_documento: row.tipo_documento || null, pdf_url: row.pdf_url || null, status: row.status || null },
    sourceUpdatedAt: row.atualizado_em || row.criado_em || null,
  }));
}

function academiaSources(limit = 100) {
  if (!tableExists('academia_biblioteca')) return [];
  return db.prepare(`
    SELECT id,titulo,descricao,arquivo_url,tipo,criado_em
    FROM academia_biblioteca
    ORDER BY datetime(criado_em) DESC,id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    sourceType: SOURCE_TYPES.ACADEMIA_BIBLIOTECA,
    sourceId: row.id,
    title: row.titulo || `Biblioteca técnica #${row.id}`,
    content: normalizeMemoryText([row.titulo, row.tipo ? `Tipo: ${row.tipo}` : '', row.descricao].filter(Boolean).join('\n')),
    metadata: { arquivo_url: row.arquivo_url || null, tipo: row.tipo || null, binary_content_indexed: false },
    sourceUpdatedAt: row.criado_em || null,
  }));
}

function equipamentoDocumentSources(limit = 100) {
  if (!tableExists('documentos_equipamento')) return [];
  return db.prepare(`
    SELECT d.id,d.equipamento_id,d.tipo,d.descricao,d.caminho_arquivo,d.data_emissao,d.data_validade,d.responsavel,e.nome AS equipamento_nome
    FROM documentos_equipamento d
    LEFT JOIN equipamentos e ON e.id=d.equipamento_id
    ORDER BY d.id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    sourceType: SOURCE_TYPES.EQUIPAMENTO_DOCUMENTO,
    sourceId: row.id,
    title: `${row.tipo || 'Documento'} • ${row.equipamento_nome || `Equipamento #${row.equipamento_id}`}`,
    content: normalizeMemoryText([
      row.equipamento_nome ? `Equipamento: ${row.equipamento_nome}` : '',
      row.tipo ? `Tipo de documento: ${row.tipo}` : '',
      row.descricao ? `Descrição: ${row.descricao}` : '',
      row.responsavel ? `Responsável: ${row.responsavel}` : '',
      row.data_emissao ? `Emissão: ${row.data_emissao}` : '',
      row.data_validade ? `Validade: ${row.data_validade}` : '',
    ].filter(Boolean).join('\n')),
    metadata: { equipamento_id: row.equipamento_id || null, equipamento_nome: row.equipamento_nome || null, caminho_arquivo: row.caminho_arquivo || null, binary_content_indexed: false },
    sourceUpdatedAt: row.data_emissao || null,
  }));
}

async function syncKnownSources({ limitPerType = 100 } = {}) {
  if (!memoryReady()) return { ok: false, skipped: true, reason: 'missing_ai_memory_chunks', indexed_sources: 0, chunks: 0 };
  const limit = Math.max(1, Math.min(Number(limitPerType || 100), 300));
  const sources = [...osDocumentSources(limit), ...academiaSources(limit), ...equipamentoDocumentSources(limit)];
  let indexedSources = 0;
  let chunks = 0;
  for (const source of sources) {
    if (!normalizeMemoryText(source.content)) continue;
    const result = await upsertSource(source);
    if (result.ok) {
      indexedSources += 1;
      chunks += Number(result.chunks || 0);
    }
  }
  return { ok: true, indexed_sources: indexedSources, chunks, source_counts: {
    os_documentos: osDocumentSources(limit).length,
    academia_biblioteca: academiaSources(limit).length,
    equipamento_documentos: equipamentoDocumentSources(limit).length,
  } };
}

function verifyAndDeactivateMissing(rows = []) {
  if (!memoryReady()) return [];
  const valid = [];
  const deactivate = db.prepare('UPDATE ai_memory_chunks SET active=0,indexed_at=datetime(\'now\') WHERE id=?');
  for (const row of rows) {
    if (sourceExists(row.source_type, row.source_id)) valid.push(row);
    else deactivate.run(Number(row.id));
  }
  return valid;
}

async function searchMemory({ query, sourceTypes = [], limit = 8, ensureIndexed = true } = {}) {
  if (!memoryReady()) return { items: [], indexed: false, reason: 'missing_ai_memory_chunks' };
  const q = normalizeMemoryText(query);
  if (!q) return { items: [], indexed: true };
  const cap = Math.max(1, Math.min(Number(limit || 8), 20));
  let total = Number(db.prepare('SELECT COUNT(*) AS total FROM ai_memory_chunks WHERE active=1').get()?.total || 0);
  let sync = null;
  if (!total && ensureIndexed) {
    sync = await syncKnownSources({ limitPerType: 100 });
    total = Number(db.prepare('SELECT COUNT(*) AS total FROM ai_memory_chunks WHERE active=1').get()?.total || 0);
  }
  if (!total) return { items: [], indexed: true, sync };

  const allowedTypes = (Array.isArray(sourceTypes) ? sourceTypes : []).filter((type) => Object.values(SOURCE_TYPES).includes(type));
  const params = [];
  let typeClause = '';
  if (allowedTypes.length) {
    typeClause = ` AND source_type IN (${allowedTypes.map(() => '?').join(',')})`;
    params.push(...allowedTypes);
  }
  const rows = db.prepare(`
    SELECT id,source_type,source_id,chunk_key,title,content,metadata_json,embedding_json,embedding_model,source_updated_at,indexed_at
    FROM ai_memory_chunks
    WHERE active=1 ${typeClause}
    ORDER BY datetime(indexed_at) DESC,id DESC
    LIMIT 1200
  `).all(...params);

  const verified = verifyAndDeactivateMissing(rows);
  const queryVector = await embeddings.generateEmbedding(q);
  const ranked = verified.map((row) => {
    const vector = vectorFromJson(row.embedding_json);
    const lexical = lexicalScore(q, `${row.title || ''}\n${row.content || ''}`);
    const cosine = vector && queryVector ? embeddings.cosineSimilarity(queryVector, vector) : 0;
    const semantic = Math.max(0, Math.min(1, (Number(cosine || 0) + 1) / 2));
    const score = (semantic * 0.7) + (lexical * 0.3);
    return { row, lexical, semantic, score };
  }).sort((a, b) => b.score - a.score).slice(0, cap);

  return {
    indexed: true,
    sync,
    items: ranked.map(({ row, lexical, semantic, score }) => ({
      source_type: row.source_type,
      source_id: row.source_id,
      chunk_key: row.chunk_key,
      title: row.title || null,
      excerpt: String(row.content || '').slice(0, 900),
      metadata: safeJson(row.metadata_json, {}),
      source_updated_at: row.source_updated_at || null,
      indexed_at: row.indexed_at || null,
      verified: true,
      score: Number(score.toFixed(4)),
      lexical_score: Number(lexical.toFixed(4)),
      semantic_score: Number(semantic.toFixed(4)),
    })),
  };
}

module.exports = {
  SOURCE_TYPES,
  memoryReady,
  sourceExists,
  upsertSource,
  syncKnownSources,
  searchMemory,
};
