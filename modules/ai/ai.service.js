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
  const text = String(value || '');
  if (!text) return '(vazio)';
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function validateAIEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter((name) => {
    const value = process.env[name];
    return typeof value === 'undefined' || String(value).trim() === '';
  });

  if (missing.length) {
    console.error('[AI] Variáveis de ambiente ausentes:', missing.join(', '));
    console.error('ENV NÃO CARREGADO:', {
      OPENAI_API_KEY: redactValue(process.env.OPENAI_API_KEY),
      AI_ENABLED: process.env.AI_ENABLED,
      OPENAI_MODEL_ACADEMIA: process.env.OPENAI_MODEL_ACADEMIA,
      OPENAI_MODEL_AVALIACAO: process.env.OPENAI_MODEL_AVALIACAO,
    });
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

function getAIConfig() {
  return {
    enabled: isAIEnabled(),
    apiKey: String(process.env.OPENAI_API_KEY || '').trim(),
    modelText: String(process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini').trim(),
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 20000),
    maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 300),
  };
}

function buildError(code, message, technical) {
  const err = new Error(message);
  err.code = code;
  err.technical = technical || message;
  return err;
}

function extractOutputText(data) {
  return String(
    data?.output_text
    || data?.output?.flatMap((i) => i?.content || []).find((c) => c?.type === 'output_text')?.text
    || ''
  ).trim();
}

async function askText({ systemPrompt, userPayload, model, maxOutputTokens, temperature = 0.2 }) {
  const cfg = getAIConfig();

  if (!cfg.enabled) throw buildError('AI_DISABLED', 'IA desativada no ambiente.', 'AI_ENABLED=false');
  if (!cfg.apiKey) throw buildError('AI_KEY_MISSING', 'IA ainda não configurada.', 'OPENAI_API_KEY ausente');

  const chosenModel = String(model || cfg.modelText || '').trim();
  if (!chosenModel) throw buildError('AI_MODEL_MISSING', 'Modelo de IA não configurado.', 'OPENAI_MODEL_TEXT ausente');

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
      throw buildError('AI_PROVIDER_ERROR', 'Falha ao consultar IA no momento.', `OpenAI ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    const text = extractOutputText(data);
    if (!text) throw buildError('AI_EMPTY_RESPONSE', 'IA sem conteúdo de resposta.', 'Resposta vazia da Responses API');

    return { text, model: chosenModel };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw buildError('AI_TIMEOUT', 'Tempo de resposta da IA excedido.', `Timeout de ${cfg.timeoutMs}ms`);
    }

    if (error?.code) throw error;

    throw buildError('AI_NETWORK_ERROR', 'Erro de conexão ao consultar IA.', error?.message || 'Falha de rede desconhecida');
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
  if (!cfg.apiKey) {
    console.warn('[AI] Teste de conexão ignorado: OPENAI_API_KEY ausente.');
    return { ok: false, skipped: true, reason: 'AI_KEY_MISSING' };
  }

  try {
    const result = await askText({
      model: process.env.OPENAI_MODEL_ACADEMIA || cfg.modelText || 'gpt-4o-mini',
      systemPrompt: 'Responda de forma curta e objetiva.',
      userPayload: { input: 'Teste simples: responda OK' },
      maxOutputTokens: 20,
      temperature: 0,
    });
    console.log('IA OK:', result.text);
    return { ok: true, text: result.text };
  } catch (err) {
    console.error('ERRO REAL IA:', err.technical || err.message);
    return { ok: false, error: err };
  }
}

module.exports = {
  getAIConfig,
  askText,
  validateAIEnvironment,
  testOpenAIConnection,
};
