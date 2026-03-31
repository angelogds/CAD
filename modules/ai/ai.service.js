const fs = require('fs');
const path = require('path');
const storagePaths = require('../../config/storage');

const ENV_KEY_CANDIDATES = ['OPENAI_API_KEY', 'OPENAI_APIKEY', 'OPENAI_KEY'];

function isAIEnabled() {
  return String(process.env.AI_ENABLED || 'true').toLowerCase() === 'true';
}

const REQUIRED_ENV_VARS = [
  'OPENAI_API_KEY',
  'AI_ENABLED',
  'OPENAI_MODEL_ACADEMIA',
  'OPENAI_MODEL_AVALIACAO',
];

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

  try {
    return JSON.parse(text);
  } catch (_e) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (_ignored) {}
    }
  }

  throw buildError('AI_INVALID_JSON', 'IA retornou JSON inválido.', 'Falha ao parsear JSON da Responses API');
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

    return { text, model: chosenModel };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw buildError('AI_TIMEOUT', 'Tempo de resposta da IA excedido.', `Timeout de ${cfg.timeoutMs}ms`, {
        providerModel: chosenModel,
      });
    }

    if (error?.code) throw error;

    throw buildError('AI_NETWORK_ERROR', 'Erro de conexão ao consultar IA.', error?.message || 'Falha de rede desconhecida', {
      providerModel: chosenModel,
    });
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
    return parseJSONObject(text);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw buildError('AI_TIMEOUT', 'Tempo de resposta da IA excedido.', `Timeout de ${cfg.timeoutMs}ms`, {
        providerModel: chosenModel,
      });
    }
    if (error?.code) throw error;
    throw buildError('AI_NETWORK_ERROR', 'Erro de conexão ao consultar IA.', error?.message || 'Falha de rede desconhecida', {
      providerModel: chosenModel,
    });
  } finally {
    clearTimeout(timeout);
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

module.exports = {
  getAIConfig,
  askText,
  askJSONSchemaStrict,
  validateAIEnvironment,
  testOpenAIConnection,
  looksLikePlaceholderKey,
};
