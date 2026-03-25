const fs = require('fs');
const path = require('path');

const ENV_KEY_CANDIDATES = ['OPENAI_API_KEY', 'OPENAI_APIKEY', 'OPENAI_KEY'];
const ONE_LINE_KEY_REGEX = /^(?:['\"])?(sk-[A-Za-z0-9._\-]+)(?:['\"])?$/;

function normalizePossibleKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  const match = key.match(ONE_LINE_KEY_REGEX);
  return match ? match[1] : '';
}

function readDotenvOneLineKey() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return '';

    const raw = fs.readFileSync(envPath, 'utf8').trim();
    if (!raw || raw.includes('\n') || raw.includes('\r')) return '';

    return normalizePossibleKey(raw);
  } catch (_e) {
    return '';
  }
}

function resolveApiKey() {
  for (const name of ENV_KEY_CANDIDATES) {
    const normalized = normalizePossibleKey(process.env[name]);
    if (normalized) {
      return { key: normalized, source: `env:${name}`, compatibilityFallback: name !== 'OPENAI_API_KEY' };
    }
  }

  const dotEnvOneLine = readDotenvOneLineKey();
  if (dotEnvOneLine) {
    return { key: dotEnvOneLine, source: 'dotenv:one-line', compatibilityFallback: true };
  }

  return { key: '', source: 'none', compatibilityFallback: false };
}

function getAIConfig() {
  const enabled = String(process.env.AI_ENABLED || 'true').toLowerCase() === 'true';
  const { key, source, compatibilityFallback } = resolveApiKey();

  return {
    enabled,
    apiKey: key,
    hasApiKey: Boolean(key),
    isConfigured: enabled && Boolean(key),
    source,
    compatibilityFallback,
  };
}

function createAIKeyMissingError(message = 'AI_KEY_MISSING') {
  const error = new Error(message);
  error.code = 'AI_KEY_MISSING';
  return error;
}

module.exports = {
  getAIConfig,
  createAIKeyMissingError,
  ENV_KEY_CANDIDATES,
};
