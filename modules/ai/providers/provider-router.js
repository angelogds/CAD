const openai = require('./openai.provider');
const local = require('./local.provider');

const PROVIDERS = new Map([
  ['openai', openai],
  ['local', local],
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

function primaryName() {
  return normalizeName(process.env.AI_PROVIDER_PRIMARY, 'openai');
}

function fallbackName() {
  const value = String(process.env.AI_PROVIDER_FALLBACK || '').trim();
  return value ? normalizeName(value) : null;
}

function primary() {
  return getProvider(primaryName());
}

function fallback() {
  const name = fallbackName();
  return name ? getProvider(name) : null;
}

async function runWithFallback(method, args) {
  const first = primary();
  try {
    return await first[method](args);
  } catch (primaryError) {
    const second = fallback();
    if (!second || second.name === first.name || typeof second[method] !== 'function') throw primaryError;
    try {
      return await second[method](args);
    } catch (fallbackError) {
      fallbackError.primary_error_code = primaryError?.code || 'AI_PROVIDER_ERROR';
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
    available: [...PROVIDERS.values()].map((provider) => provider.status()),
  };
}

module.exports = {
  getProvider,
  primaryName,
  fallbackName,
  primary,
  fallback,
  runWithFallback,
  status,
};
