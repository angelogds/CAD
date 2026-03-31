const aiCore = require('../ai/ai.service');
const { IA_RESULT_JSON_SCHEMA, IA_RESULT_REQUIRED_FIELDS } = require('./ia.schema');

const IA_SYSTEM_PROMPT = [
  'Você é um assistente técnico de manutenção industrial.',
  'Responda SEMPRE em português do Brasil.',
  'Retorne apenas dados técnicos coerentes com os dados informados.',
  'Não invente medições, códigos de peças ou materiais não citados.',
].join(' ');

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeMateriais(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function normalizeConfianca(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function buildFallback(reason) {
  return {
    resumo_usuario: 'Análise automática indisponível no momento.',
    descricao_tecnica: 'Não foi possível consolidar análise técnica automática com segurança.',
    acao_corretiva: 'Executar inspeção em campo e corrigir a causa raiz identificada.',
    acao_preventiva: 'Reforçar rotina de inspeção preventiva e registrar evidências de reincidência.',
    materiais_citados: [],
    tipo_intervencao: 'INSPECAO',
    confianca: 15,
    observacao_ia: `Fallback aplicado: ${normalizeString(reason) || 'resposta inválida da IA.'}`,
  };
}

function validateIAResultShape(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Payload deve ser um objeto JSON.'] };
  }

  for (const field of IA_RESULT_REQUIRED_FIELDS) {
    if (!(field in payload)) errors.push(`Campo obrigatório ausente: ${field}`);
  }

  const known = new Set(IA_RESULT_REQUIRED_FIELDS);
  for (const key of Object.keys(payload)) {
    if (!known.has(key)) errors.push(`Campo não permitido: ${key}`);
  }

  if (typeof payload.resumo_usuario !== 'string') errors.push('resumo_usuario deve ser string');
  if (typeof payload.descricao_tecnica !== 'string') errors.push('descricao_tecnica deve ser string');
  if (typeof payload.acao_corretiva !== 'string') errors.push('acao_corretiva deve ser string');
  if (typeof payload.acao_preventiva !== 'string') errors.push('acao_preventiva deve ser string');
  if (!Array.isArray(payload.materiais_citados)) errors.push('materiais_citados deve ser array');
  if (Array.isArray(payload.materiais_citados) && payload.materiais_citados.some((v) => typeof v !== 'string')) {
    errors.push('materiais_citados deve conter apenas strings');
  }
  if (typeof payload.tipo_intervencao !== 'string') errors.push('tipo_intervencao deve ser string');

  const conf = Number(payload.confianca);
  if (!Number.isFinite(conf) || conf < 0 || conf > 100) errors.push('confianca deve estar entre 0 e 100');

  if (typeof payload.observacao_ia !== 'string') errors.push('observacao_ia deve ser string');

  return { valid: errors.length === 0, errors };
}

function sanitizeIAResult(payload) {
  return {
    resumo_usuario: normalizeString(payload?.resumo_usuario),
    descricao_tecnica: normalizeString(payload?.descricao_tecnica),
    acao_corretiva: normalizeString(payload?.acao_corretiva),
    acao_preventiva: normalizeString(payload?.acao_preventiva),
    materiais_citados: normalizeMateriais(payload?.materiais_citados),
    tipo_intervencao: normalizeString(payload?.tipo_intervencao).toUpperCase() || 'INSPECAO',
    confianca: normalizeConfianca(payload?.confianca),
    observacao_ia: normalizeString(payload?.observacao_ia),
  };
}

async function gerarAnalisePadronizada(payload, options = {}) {
  const model = options.model || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';

  try {
    const json = await aiCore.askJSONSchemaStrict({
      model,
      systemPrompt: options.systemPrompt || IA_SYSTEM_PROMPT,
      userPayload: payload,
      schemaName: 'analise_intervencao',
      schema: IA_RESULT_JSON_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: options.maxOutputTokens,
    });

    const validation = validateIAResultShape(json);
    if (!validation.valid) {
      return {
        data: buildFallback(validation.errors.join('; ')),
        valid: false,
        errors: validation.errors,
        fallbackApplied: true,
      };
    }

    return {
      data: sanitizeIAResult(json),
      valid: true,
      errors: [],
      fallbackApplied: false,
    };
  } catch (err) {
    return {
      data: buildFallback(err?.message || 'erro na chamada da IA'),
      valid: false,
      errors: [err?.message || 'erro desconhecido na IA'],
      fallbackApplied: true,
    };
  }
}

module.exports = {
  IA_SYSTEM_PROMPT,
  validateIAResultShape,
  sanitizeIAResult,
  buildFallback,
  gerarAnalisePadronizada,
};
