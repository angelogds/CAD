const openai = require('./openai.provider');
const local = require('./local.provider');
const omniroute = require('./omniroute.provider');

const PROVIDERS = new Map([
  ['openai', openai],
  ['local', local],
  ['omniroute', omniroute],
]);

function normalizeName(value, fallback = 'openai') {
  const name = String(value || fallback).trim().toLowerCase();
  return name || fallback;
}

function getProvider(name) {
  const normalized = normalizeName(name);
  const provider = PROVIDERS.get(normalized);
  if (provider) return provider;
  const err = new Error(`Provider de IA não suportado: ${normalized}.`);
  err.code = 'AI_PROVIDER_UNSUPPORTED';
  err.status = 503;
  throw err;
}

function primaryName(method) {
  if (method === 'createResponse' && String(process.env.AI_PROVIDER_TEXT_PRIMARY || '').trim()) {
    return normalizeName(process.env.AI_PROVIDER_TEXT_PRIMARY);
  }
  return normalizeName(process.env.AI_PROVIDER_PRIMARY, 'openai');
}

function fallbackName(method) {
  // Presente e vazia desativa fallback somente para texto.
  if (method === 'createResponse' && process.env.AI_PROVIDER_TEXT_FALLBACK !== undefined) {
    const textFallback = String(process.env.AI_PROVIDER_TEXT_FALLBACK).trim();
    return textFallback ? normalizeName(textFallback) : null;
  }
  const value = String(process.env.AI_PROVIDER_FALLBACK || '').trim();
  return value ? normalizeName(value) : null;
}

function primary(method) {
  return getProvider(primaryName(method));
}

function fallback(method) {
  const name = fallbackName(method);
  return name ? getProvider(name) : null;
}

function shouldFallback(error) {
  const code = String(error?.code || '').toUpperCase();
  const providerStatus = Number(error?.provider_status || 0);
  if (code === 'AI_TIMEOUT') return true;
  if (providerStatus === 429 || providerStatus >= 500) return true;
  if (!providerStatus && error?.name === 'TypeError') return true;
  return false;
}

async function runWithFallback(method, args) {
  const first = primary(method);
  try {
    return await first[method](args);
  } catch (primaryError) {
    const second = fallback(method);
    if (!second || second.name === first.name || typeof second[method] !== 'function' || !shouldFallback(primaryError)) throw primaryError;
    try {
      return await second[method](args);
    } catch (fallbackError) {
      fallbackError.primary_error_code = primaryError?.code || 'AI_PROVIDER_ERROR';
      fallbackError.primary_provider_status = Number(primaryError?.provider_status || 0) || null;
      throw fallbackError;
    }
  }
}

function status() {
  const primaryProvider = primary();
  const fallbackProvider = fallback();
  return {
    primary: { selected: primaryProvider.name, ...primaryProvider.status() },
    fallback: fallbackProvider ? { selected: fallbackProvider.name, ...fallbackProvider.status() } : null,
    text: {
      primary: { selected: primaryName('createResponse'), ...primary('createResponse').status() },
      fallback: fallback('createResponse') ? { selected: fallbackName('createResponse'), ...fallback('createResponse').status() } : null,
    },
    available: [...PROVIDERS.values()].map((provider) => provider.status()),
  };
}

module.exports = {
  getProvider,
  primaryName,
  fallbackName,
  primary,
  fallback,
  shouldFallback,
  runWithFallback,
  status,
};
