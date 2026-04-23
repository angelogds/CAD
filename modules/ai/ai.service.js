const fs = require('fs');
const path = require('path');
const storagePaths = require('../../config/storage');
const db = require('../../database/db');

const ENV_KEY_CANDIDATES = ['OPENAI_API_KEY', 'OPENAI_APIKEY', 'OPENAI_KEY'];

function isAIEnabled() {
  return String(process.env.AI_ENABLED || 'true').toLowerCase() === 'true';
}

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name || ''));
  } catch (_e) {
    return false;
  }
}

const REQUIRED_ENV_VARS = [
  'OPENAI_API_KEY',
  'AI_ENABLED',
  'OPENAI_MODEL_ACADEMIA',
  'OPENAI_MODEL_AVALIACAO',
];
const aiRuntimeCache = new Map();
const aiRuntimeStats = {
  cacheHits: 0,
  cacheMisses: 0,
  lastErrors: [],
};

function redactValue(value) {
  const text = String(value || '').trim();
  if (!text) return '(vazio)';
  if (text.length <= 4) return '****';
  return `****${text.slice(-4)}`;
}

function looksLikePlaceholderKey(value) {
  const text = String(value || '').trim();
  if (!text) return false;

  const upper = text.toUpperCase();
  if (upper.includes('SUA_CHAVE') || upper.includes('OPENAI_API_KEY=')) return true;
  if (upper.includes('INSIRA') || upper.includes('EXEMPLO') || upper.includes('PLACEHOLDER')) return true;
  if (!text.startsWith('sk-')) return true;
  if (text.length < 20) return true;

  return false;
}

function resolveApiKey() {
  for (const keyName of ENV_KEY_CANDIDATES) {
    const raw = String(process.env[keyName] || '').trim();
    if (raw) {
      return {
        value: raw,
        source: keyName,
        looksPlaceholder: looksLikePlaceholderKey(raw),
      };
    }
  }

  return {
    value: '',
    source: 'none',
    looksPlaceholder: false,
  };
}

function validateAIEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter((name) => {
    const value = process.env[name];
    return typeof value === 'undefined' || String(value).trim() === '';
  });

  const keyInfo = resolveApiKey();

  if (missing.length || keyInfo.looksPlaceholder) {
    console.error('[AI] Problemas de configuração detectados:', {
      missing,
      AI_ENABLED: process.env.AI_ENABLED,
      OPENAI_MODEL_ACADEMIA: process.env.OPENAI_MODEL_ACADEMIA,
      OPENAI_MODEL_AVALIACAO: process.env.OPENAI_MODEL_AVALIACAO,
      keySource: keyInfo.source,
      hasApiKey: Boolean(keyInfo.value),
      keyMasked: redactValue(keyInfo.value),
      placeholderKey: keyInfo.looksPlaceholder,
    });
  }

  return {
    ok: missing.length === 0 && !keyInfo.looksPlaceholder,
    missing,
    placeholderKey: keyInfo.looksPlaceholder,
  };
}

function getAIConfig() {
  const resolved = resolveApiKey();
  return {
    enabled: isAIEnabled(),
    apiKey: resolved.value,
    apiKeySource: resolved.source,
    hasApiKey: Boolean(resolved.value),
    apiKeyLooksPlaceholder: resolved.looksPlaceholder,
    modelText: String(process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 20000),
    maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 300),
  };
}

function buildError(code, message, technical, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.technical = technical || message;
  Object.assign(err, extra);
  return err;
}

function registerAIError(err, context = null) {
  aiRuntimeStats.lastErrors.unshift({
    code: String(err?.code || 'AI_ERROR'),
    message: String(err?.message || 'Erro de IA'),
    context,
    at: new Date().toISOString(),
  });
  if (aiRuntimeStats.lastErrors.length > 15) aiRuntimeStats.lastErrors = aiRuntimeStats.lastErrors.slice(0, 15);
}

function logUsage({ tipo, status = 'ok', payload = null, erro = null }) {
  if (!tableExists('ai_usage_logs')) return;
  try {
    db.prepare(`
      INSERT INTO ai_usage_logs (tipo, payload_json, status, erro_tecnico, criado_em)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(
      String(tipo || 'generic'),
      JSON.stringify(payload || {}),
      String(status || 'ok'),
      erro ? String(erro).slice(0, 600) : null
    );
  } catch (_e) {}
}

function extractOutputText(data) {
  const directText = String(data?.output_text || '').trim();
  if (directText) return directText;

  const parsedText = data?.output_parsed;
  if (parsedText && typeof parsedText === 'object') {
    try {
      return JSON.stringify(parsedText);
    } catch (_e) {}
  }

  const content = Array.isArray(data?.output)
    ? data.output.flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    : [];

  const outputText = content.find((c) => c?.type === 'output_text' && typeof c?.text === 'string')?.text;
  if (String(outputText || '').trim()) return String(outputText).trim();

  const outputJson = content.find((c) => c?.type === 'output_json');
  if (outputJson && typeof outputJson?.json === 'object') {
    try {
      return JSON.stringify(outputJson.json);
    } catch (_e) {}
  }

  const outputAnyJson = content.find((c) => c && typeof c === 'object' && c?.json && typeof c.json === 'object');
  if (outputAnyJson) {
    try {
      return JSON.stringify(outputAnyJson.json);
    } catch (_e) {}
  }

  return '';
}

function parseJSONObject(rawText) {
  const text = String(rawText || '').trim();
  if (!text) throw buildError('AI_EMPTY_RESPONSE', 'IA sem conteúdo de resposta.', 'Resposta JSON vazia da Responses API');

  const unwrapFencedJson = (value) => {
    const match = String(value || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
    return match ? match[1].trim() : String(value || '').trim();
  };

  const findFirstJSONObject = (value) => {
    const source = String(value || '');
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }
      if (ch === '}') {
        if (depth > 0) depth -= 1;
        if (depth === 0 && start >= 0) return source.slice(start, i + 1);
      }
    }
    return '';
  };

  const normalized = unwrapFencedJson(text);

  const sanitizeJSONLikeText = (value) => {
    let s = String(value || '').trim();
    if (!s) return s;
    s = s
      .replace(/^\uFEFF/, '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    s = s.replace(/,\s*([}\]])/g, '$1');
    return s.trim();
  };

  const tryParse = (candidate) => {
    const source = String(candidate || '').trim();
    if (!source) return null;
    try {
      return JSON.parse(source);
    } catch (_e) {
      return null;
    }
  };

  const direct = tryParse(normalized);
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct;

  const extracted = findFirstJSONObject(normalized);
  const extractedParsed = tryParse(extracted);
  if (extractedParsed && typeof extractedParsed === 'object' && !Array.isArray(extractedParsed)) return extractedParsed;

  const sanitizedDirect = tryParse(sanitizeJSONLikeText(normalized));
  if (sanitizedDirect && typeof sanitizedDirect === 'object' && !Array.isArray(sanitizedDirect)) return sanitizedDirect;

  const sanitizedExtracted = tryParse(sanitizeJSONLikeText(extracted));
  if (sanitizedExtracted && typeof sanitizedExtracted === 'object' && !Array.isArray(sanitizedExtracted)) return sanitizedExtracted;

  if (direct && typeof direct === 'object') return direct;
  if (extractedParsed && typeof extractedParsed === 'object') return extractedParsed;
  if (sanitizedDirect && typeof sanitizedDirect === 'object') return sanitizedDirect;
  if (sanitizedExtracted && typeof sanitizedExtracted === 'object') return sanitizedExtracted;

  if (Array.isArray(direct) || Array.isArray(extractedParsed) || Array.isArray(sanitizedDirect) || Array.isArray(sanitizedExtracted)) {
    throw buildError(
      'AI_INVALID_JSON',
      'IA retornou JSON fora do formato esperado.',
      'JSON recebido é array; esperado objeto',
      { preview: normalized.slice(0, 220) }
    );
  }

  throw buildError('AI_INVALID_JSON', 'IA retornou JSON inválido.', 'Falha ao parsear JSON da Responses API', {
    preview: normalized.slice(0, 220),
  });
}

async function askText({ systemPrompt, userPayload, model, maxOutputTokens, temperature = 0.2 }) {
  const cfg = getAIConfig();

  if (!cfg.enabled) throw buildError('AI_DISABLED', 'IA desativada no ambiente.', 'AI_ENABLED=false');
  if (!cfg.hasApiKey) throw buildError('AI_KEY_MISSING', 'IA ainda não ativada. Configure OPENAI_API_KEY.', 'OPENAI_API_KEY ausente');
  if (cfg.apiKeyLooksPlaceholder) {
    throw buildError('AI_KEY_PLACEHOLDER', 'Configuração da IA inválida. Revise a chave da API.', 'OPENAI_API_KEY parece placeholder');
  }

  const chosenModel = String(model || cfg.modelText || '').trim() || 'gpt-4o-mini';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const cacheEnabled = String(process.env.AI_CACHE_ENABLED || 'true').toLowerCase() === 'true';
    const cacheTtlMs = Number(process.env.AI_CACHE_TTL_MS || 60_000);
    const cacheKey = cacheEnabled
      ? JSON.stringify({ m: chosenModel, s: String(systemPrompt || ''), p: userPayload || {}, t: Number(temperature || 0.2), o: Number(maxOutputTokens || cfg.maxOutputTokens) })
      : null;
    const cached = cacheKey ? aiRuntimeCache.get(cacheKey) : null;
    if (cached && cached.exp > Date.now()) {
      aiRuntimeStats.cacheHits += 1;
      return cached.value;
    }
    if (cacheEnabled && cacheKey) aiRuntimeStats.cacheMisses += 1;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: chosenModel,
        max_output_tokens: Number(maxOutputTokens || cfg.maxOutputTokens),
        temperature,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: String(systemPrompt || '') }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(userPayload || {}) }] },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const summary = body.slice(0, 500);
      const byStatus = {
        400: 'AI_BAD_REQUEST',
        401: 'AI_UNAUTHORIZED',
        404: 'AI_MODEL_NOT_FOUND',
        408: 'AI_TIMEOUT',
        429: 'AI_RATE_LIMIT',
      };
      throw buildError(
        byStatus[response.status] || 'AI_PROVIDER_ERROR',
        'Falha ao consultar IA no momento.',
        `OpenAI ${response.status}: ${summary}`,
        {
          providerStatus: response.status,
          providerBodySummary: summary,
          providerModel: chosenModel,
        }
      );
    }

    const data = await response.json();
    const text = extractOutputText(data);
    if (!text) {
      throw buildError('AI_EMPTY_RESPONSE', 'IA sem conteúdo de resposta.', 'Resposta vazia da Responses API', {
        providerModel: chosenModel,
      });
    }

    const payload = { text, model: chosenModel };
    if (cacheEnabled && cacheKey) aiRuntimeCache.set(cacheKey, { exp: Date.now() + cacheTtlMs, value: payload });
    logUsage({ tipo: 'ask_text', payload: { model: chosenModel } });
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw buildError('AI_TIMEOUT', 'Tempo de resposta da IA excedido.', `Timeout de ${cfg.timeoutMs}ms`, {
        providerModel: chosenModel,
      });
    }

    if (error?.code) {
      registerAIError(error, 'askText');
      logUsage({ tipo: 'ask_text', status: 'erro', payload: { model: chosenModel }, erro: error.technical || error.message });
      throw error;
    }

    const wrapped = buildError('AI_NETWORK_ERROR', 'Erro de conexão ao consultar IA.', error?.message || 'Falha de rede desconhecida', {
      providerModel: chosenModel,
    });
    registerAIError(wrapped, 'askText');
    logUsage({ tipo: 'ask_text', status: 'erro', payload: { model: chosenModel }, erro: wrapped.technical || wrapped.message });
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

async function askJSONSchemaStrict({
  systemPrompt,
  userPayload,
  model,
  schemaName,
  schema,
  maxOutputTokens,
  temperature = 0.2,
}) {
  const cfg = getAIConfig();

  if (!cfg.enabled) throw buildError('AI_DISABLED', 'IA desativada no ambiente.', 'AI_ENABLED=false');
  if (!cfg.hasApiKey) throw buildError('AI_KEY_MISSING', 'IA ainda não ativada. Configure OPENAI_API_KEY.', 'OPENAI_API_KEY ausente');
  if (cfg.apiKeyLooksPlaceholder) {
    throw buildError('AI_KEY_PLACEHOLDER', 'Configuração da IA inválida. Revise a chave da API.', 'OPENAI_API_KEY parece placeholder');
  }
  if (!schema || typeof schema !== 'object') {
    throw buildError('AI_SCHEMA_INVALID', 'Schema JSON ausente para chamada estruturada.', 'Parâmetro schema inválido');
  }

  const chosenModel = String(model || cfg.modelText || '').trim() || 'gpt-4o-mini';
  const chosenSchemaName = String(schemaName || 'structured_output').trim() || 'structured_output';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: chosenModel,
        max_output_tokens: Number(maxOutputTokens || cfg.maxOutputTokens),
        temperature,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: String(systemPrompt || '') }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(userPayload || {}) }] },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: chosenSchemaName,
            schema,
            strict: true,
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const summary = body.slice(0, 500);
      const byStatus = {
        400: 'AI_BAD_REQUEST',
        401: 'AI_UNAUTHORIZED',
        404: 'AI_MODEL_NOT_FOUND',
        408: 'AI_TIMEOUT',
        429: 'AI_RATE_LIMIT',
      };
      throw buildError(
        byStatus[response.status] || 'AI_PROVIDER_ERROR',
        'Falha ao consultar IA no momento.',
        `OpenAI ${response.status}: ${summary}`,
        {
          providerStatus: response.status,
          providerBodySummary: summary,
          providerModel: chosenModel,
        }
      );
    }

    const data = await response.json();
    const text = extractOutputText(data);
    const parsed = parseJSONObject(text);
    logUsage({ tipo: 'ask_json_schema', payload: { model: chosenModel, schema: chosenSchemaName } });
    return parsed;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw buildError('AI_TIMEOUT', 'Tempo de resposta da IA excedido.', `Timeout de ${cfg.timeoutMs}ms`, {
        providerModel: chosenModel,
      });
    }
    if (error?.code) {
      registerAIError(error, 'askJSONSchemaStrict');
      logUsage({ tipo: 'ask_json_schema', status: 'erro', payload: { model: chosenModel, schema: chosenSchemaName }, erro: error.technical || error.message });
      throw error;
    }
    const wrapped = buildError('AI_NETWORK_ERROR', 'Erro de conexão ao consultar IA.', error?.message || 'Falha de rede desconhecida', {
      providerModel: chosenModel,
    });
    registerAIError(wrapped, 'askJSONSchemaStrict');
    logUsage({ tipo: 'ask_json_schema', status: 'erro', payload: { model: chosenModel, schema: chosenSchemaName }, erro: wrapped.technical || wrapped.message });
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}



function normalizeCriticidade(value) {
  const raw = String(value || 'media').toLowerCase();
  if (raw.includes('crit')) return 'critica';
  if (raw.includes('alt')) return 'alta';
  if (raw.includes('baix')) return 'baixa';
  return 'media';
}

function normalizeStructuredAIResponse(data = {}) {
  return {
    diagnostico: String(data.diagnostico || data.diagnostico_inicial || '').trim() || 'Diagnóstico inicial pendente de validação em campo.',
    causa_provavel: String(data.causa_provavel || '').trim() || 'Causa provável ainda não definida.',
    acao_recomendada: String(data.acao_recomendada || data.acao_corretiva || '').trim() || 'Executar inspeção técnica segura e definir plano corretivo.',
    criticidade: normalizeCriticidade(data.criticidade || data.criticidade_sugerida),
  };
}

async function gerarDiagnosticoOS(payload = {}) {
  const result = await askText({
    systemPrompt: 'Você é especialista em manutenção industrial. Responda somente JSON com: diagnostico, causa_provavel, acao_recomendada, criticidade.',
    userPayload: payload,
    maxOutputTokens: 260,
    temperature: 0.1,
  });
  let parsed = {};
  try { parsed = JSON.parse(String(result?.text || '{}')); } catch (_e) {}
  return normalizeStructuredAIResponse(parsed);
}

async function melhorarDescricaoOperador(texto = '', contexto = {}) {
  const result = await askText({
    systemPrompt: 'Transforme relato operacional em texto técnico estruturado. Responda JSON com diagnostico, causa_provavel, acao_recomendada, criticidade.',
    userPayload: { relato: String(texto || ''), contexto },
    maxOutputTokens: 260,
    temperature: 0.1,
  });
  let parsed = {};
  try { parsed = JSON.parse(String(result?.text || '{}')); } catch (_e) {}
  return normalizeStructuredAIResponse(parsed);
}

async function sugerirPecasPorFalha(payload = {}) {
  const result = await askText({
    systemPrompt: 'Retorne JSON com campo itens (array) contendo peças e ferramentas prováveis para manutenção.',
    userPayload: payload,
    maxOutputTokens: 220,
    temperature: 0.2,
  });
  try {
    const parsed = JSON.parse(String(result?.text || '{}'));
    const itens = Array.isArray(parsed.itens) ? parsed.itens : [];
    return itens.map((i) => String(i || '').trim()).filter(Boolean).slice(0, 12);
  } catch (_e) {
    return [];
  }
}

async function testOpenAIConnection() {
  const cfg = getAIConfig();
  if (!cfg.enabled) {
    console.warn('[AI] Teste de conexão ignorado: AI_ENABLED=false.');
    return { ok: false, skipped: true, reason: 'AI_DISABLED' };
  }
  if (!cfg.hasApiKey) {
    console.warn('[AI] Teste de conexão ignorado: OPENAI_API_KEY ausente.');
    return { ok: false, skipped: true, reason: 'AI_KEY_MISSING' };
  }
  if (cfg.apiKeyLooksPlaceholder) {
    console.warn('[AI] Teste de conexão ignorado: chave parece placeholder.', {
      keySource: cfg.apiKeySource,
      keyMasked: redactValue(cfg.apiKey),
    });
    return { ok: false, skipped: true, reason: 'AI_KEY_PLACEHOLDER' };
  }

  try {
    const result = await askText({
      model: process.env.OPENAI_MODEL_ACADEMIA || cfg.modelText || 'gpt-4o-mini',
      systemPrompt: 'Responda de forma curta e objetiva.',
      userPayload: { input: 'Responda apenas OK' },
      maxOutputTokens: 20,
      temperature: 0,
    });
    console.log('IA OK:', result.text);
    return { ok: true, text: result.text };
  } catch (err) {
    console.error('ERRO REAL IA:', {
      code: err?.code,
      message: err?.message,
      technical: err?.technical,
      providerStatus: err?.providerStatus,
      providerBodySummary: err?.providerBodySummary,
    });
    return { ok: false, error: err };
  }
}

function clearCache() {
  const before = aiRuntimeCache.size;
  aiRuntimeCache.clear();
  return { ok: true, cleared: before };
}

function getStatus() {
  const cfg = getAIConfig();
  return {
    ok: cfg.enabled && cfg.hasApiKey && !cfg.apiKeyLooksPlaceholder,
    enabled: cfg.enabled,
    hasApiKey: cfg.hasApiKey,
    apiKeySource: cfg.apiKeySource,
    cache: {
      enabled: String(process.env.AI_CACHE_ENABLED || 'true').toLowerCase() === 'true',
      size: aiRuntimeCache.size,
      hits: aiRuntimeStats.cacheHits,
      misses: aiRuntimeStats.cacheMisses,
    },
    errors_recentes: aiRuntimeStats.lastErrors.slice(0, 10),
    model_text: cfg.modelText,
    timeout_ms: cfg.timeoutMs,
  };
}

async function semanticSearch({ query, equipamentoId = null, limit = 5 } = {}) {
  const embeddingsService = require('./ai.embeddings.service');
  const texto = String(query || '').trim();
  if (!texto) return [];
  return embeddingsService.searchSimilarOS(texto, { equipamentoId, limit });
}

async function chatbotContextual({ message, context = {}, conversationId = null, userId = null }) {
  const db = require('../../database/db');
  const embeddingsService = require('./ai.embeddings.service');
  const texto = String(message || '').trim();
  if (!texto) return { resposta: 'Pergunta vazia.', conversation_id: conversationId };

  const similares = await embeddingsService.searchSimilarOS(texto, {
    equipamentoId: Number(context?.equipamento_id || 0) || null,
    limit: 4,
    minScore: 0.4,
  });
  const result = await askText({
    systemPrompt: 'Você é assistente técnico de manutenção industrial. Responda em português-BR, com foco em segurança operacional.',
    userPayload: { mensagem: texto, contexto: context || {}, os_similares: similares },
    maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 320),
    temperature: 0.2,
  });

  if (tableExists('ai_conversations')) {
    try {
      db.prepare(`
        INSERT INTO ai_conversations (conversation_id, user_id, context_json, message, response, model, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        String(conversationId || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        userId ? Number(userId) : null,
        JSON.stringify(context || {}),
        texto,
        String(result.text || ''),
        String(result.model || '')
      );
    } catch (_e) {}
  }

  return {
    resposta: result.text,
    os_similares: similares,
    conversation_id: conversationId || null,
    model: result.model,
  };
}

async function generateExecutiveReport({ periodDays = 7 } = {}) {
  const db = require('../../database/db');
  const usage = tableExists('ai_usage_logs')
    ? db.prepare(`SELECT tipo, COUNT(*) AS total FROM ai_usage_logs WHERE datetime(criado_em) >= datetime('now', ?) GROUP BY tipo ORDER BY total DESC`).all(`-${Number(periodDays || 7)} days`)
    : [];
  const osStats = tableExists('os')
    ? db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN ai_diagnostico IS NOT NULL OR ai_analise_completa IS NOT NULL THEN 1 ELSE 0 END) AS com_ia FROM os`).get()
    : { total: 0, com_ia: 0 };

  return {
    periodo_dias: Number(periodDays || 7),
    total_os: Number(osStats.total || 0),
    os_com_ia: Number(osStats.com_ia || 0),
    taxa_adocao: Number(osStats.total ? ((Number(osStats.com_ia || 0) / Number(osStats.total)) * 100).toFixed(2) : 0),
    uso_por_tipo: usage,
  };
}

async function getEquipmentHealth(equipamentoId) {
  const db = require('../../database/db');
  if (!tableExists('equipamentos')) return null;
  const eq = db.prepare('SELECT * FROM equipamentos WHERE id = ? LIMIT 1').get(Number(equipamentoId));
  if (!eq) return null;
  const osRows = tableExists('os')
    ? db.prepare(`SELECT prioridade, grau, status FROM os WHERE equipamento_id = ? ORDER BY id DESC LIMIT 60`).all(Number(equipamentoId))
    : [];
  const total = osRows.length;
  const criticas = osRows.filter((r) => ['ALTA', 'CRITICA', 'CRÍTICA'].includes(String(r.prioridade || r.grau || '').toUpperCase())).length;
  const abertas = osRows.filter((r) => ['ABERTA', 'ANDAMENTO', 'EM_ANDAMENTO'].includes(String(r.status || '').toUpperCase())).length;
  const score = Math.max(0, 100 - (criticas * 8) - (abertas * 4));
  const saude = score >= 80 ? 'boa' : score >= 55 ? 'atencao' : 'critica';
  return { equipamento_id: Number(equipamentoId), score, saude, total_os_recentes: total, os_criticas: criticas, os_abertas: abertas };
}

async function getEquipmentRecommendations(equipamentoId) {
  const health = await getEquipmentHealth(equipamentoId);
  if (!health) return null;
  const recomendacoes = [];
  if (health.saude === 'critica') recomendacoes.push('Programar intervenção corretiva imediata e inspeção de segurança.');
  if (health.os_abertas >= 3) recomendacoes.push('Priorizar fechamento das OS abertas com checklist técnico.');
  if (!recomendacoes.length) recomendacoes.push('Manter rotina preventiva e inspeções de condição.');
  return {
    ...health,
    recomendacoes_imediatas: recomendacoes,
    recomendacoes_medio_prazo: ['Atualizar plano preventivo com foco em reincidências.', 'Revisar estoque mínimo de peças críticas.'],
  };
}

module.exports = {
  getAIConfig,
  askText,
  askJSONSchemaStrict,
  validateAIEnvironment,
  testOpenAIConnection,
  getStatus,
  clearCache,
  semanticSearch,
  chatbotContextual,
  generateExecutiveReport,
  getEquipmentRecommendations,
  getEquipmentHealth,
  looksLikePlaceholderKey,
  gerarDiagnosticoOS,
  melhorarDescricaoOperador,
  sugerirPecasPorFalha,
  normalizeStructuredAIResponse,
};
