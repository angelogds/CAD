const { askJSONSchemaStrict } = require('./ai.service');
const db = require('../../database/db');

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name || ''));
  } catch (_e) {
    return false;
  }
}

function normalizeCriticidade(value) {
  const raw = String(value || 'media').toLowerCase();
  if (raw.includes('crit')) return 'critica';
  if (raw.includes('alt')) return 'alta';
  if (raw.includes('baix')) return 'baixa';
  return 'media';
}

function defaultVisionPayload() {
  return {
    falha_provavel: 'Falha mecânica não classificada',
    gravidade: 'media',
    componentes_afetados: [],
    acoes_recomendadas: ['Executar inspeção técnica presencial com bloqueio seguro de energia.'],
    observacoes: 'Análise feita em fallback por indisponibilidade da IA.',
    confianca: 30,
  };
}

function persistAnalysis({ osId = null, equipamentoId = null, tipo = 'single_image', payload = {}, model = null }) {
  if (!tableExists('ai_image_analyses')) return;
  try {
    db.prepare(`
      INSERT INTO ai_image_analyses (
        os_id, equipamento_id, tipo_analise, resultado_json, gravidade,
        componentes_json, modelo, criado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      osId ? Number(osId) : null,
      equipamentoId ? Number(equipamentoId) : null,
      String(tipo || 'single_image'),
      JSON.stringify(payload || {}),
      normalizeCriticidade(payload.gravidade),
      JSON.stringify(Array.isArray(payload.componentes_afetados) ? payload.componentes_afetados : []),
      model || process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini'
    );
  } catch (_e) {}
}

async function analyzeEquipmentImage(imageBase64, options = {}) {
  const base64 = String(imageBase64 || '').trim();
  if (!base64) return defaultVisionPayload();

  try {
    const result = await askJSONSchemaStrict({
      model: process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
      systemPrompt: [
        'Você é um especialista em inspeção visual de falhas industriais.',
        'Classifique gravidade com foco em segurança operacional e continuidade da produção.',
        'Responda estritamente no JSON do schema.',
      ].join('\n'),
      schemaName: 'vision_analise_falha',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['falha_provavel', 'gravidade', 'componentes_afetados', 'acoes_recomendadas', 'observacoes', 'confianca'],
        properties: {
          falha_provavel: { type: 'string' },
          gravidade: { type: 'string', enum: ['baixa', 'media', 'alta', 'critica'] },
          componentes_afetados: { type: 'array', items: { type: 'string' }, maxItems: 12 },
          acoes_recomendadas: { type: 'array', items: { type: 'string' }, maxItems: 12 },
          observacoes: { type: 'string' },
          confianca: { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
      userPayload: {
        contexto: options.context || null,
        imagem: {
          mime_type: options.mimeType || 'image/jpeg',
          base64,
        },
      },
      maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 350),
      temperature: 0.1,
    });

    const payload = {
      falha_provavel: String(result?.falha_provavel || '').trim() || 'Falha visual não classificada',
      gravidade: normalizeCriticidade(result?.gravidade),
      componentes_afetados: Array.isArray(result?.componentes_afetados) ? result.componentes_afetados.filter(Boolean).slice(0, 12) : [],
      acoes_recomendadas: Array.isArray(result?.acoes_recomendadas) ? result.acoes_recomendadas.filter(Boolean).slice(0, 12) : [],
      observacoes: String(result?.observacoes || '').trim() || 'Análise sem observações adicionais.',
      confianca: Number(result?.confianca || 0),
    };

    persistAnalysis({ osId: options.osId, equipamentoId: options.equipamentoId, tipo: 'single_image', payload });
    return payload;
  } catch (_e) {
    const fallback = defaultVisionPayload();
    persistAnalysis({ osId: options.osId, equipamentoId: options.equipamentoId, tipo: 'single_image_fallback', payload: fallback });
    return fallback;
  }
}

async function analyzeOSImage(osId, imageBase64, context = {}) {
  const row = tableExists('os')
    ? db.prepare('SELECT id, equipamento_id, descricao, sintoma_principal FROM os WHERE id = ? LIMIT 1').get(Number(osId))
    : null;

  const result = await analyzeEquipmentImage(imageBase64, {
    osId: Number(osId),
    equipamentoId: row?.equipamento_id || context?.equipamento_id || null,
    context: {
      os: row || null,
      contexto_usuario: context || null,
    },
    mimeType: context?.mimeType || 'image/jpeg',
  });

  if (row && tableExists('os')) {
    try {
      db.prepare(`
        UPDATE os
        SET ai_criticidade = ?,
            ai_sugestao = ?,
            ai_ultima_analise_em = datetime('now')
        WHERE id = ?
      `).run(result.gravidade, (result.acoes_recomendadas || []).join(' | '), Number(osId));
    } catch (_e) {}
  }

  return result;
}

async function compareBeforeAfterImages(beforeBase64, afterBase64, context = {}) {
  const beforeAnalysis = await analyzeEquipmentImage(beforeBase64, {
    context: { tipo: 'before', ...context },
    osId: context.os_id || null,
    equipamentoId: context.equipamento_id || null,
    mimeType: context.mimeType || 'image/jpeg',
  });
  const afterAnalysis = await analyzeEquipmentImage(afterBase64, {
    context: { tipo: 'after', ...context },
    osId: context.os_id || null,
    equipamentoId: context.equipamento_id || null,
    mimeType: context.mimeType || 'image/jpeg',
  });

  const criticidadeOrder = { baixa: 1, media: 2, alta: 3, critica: 4 };
  const improved = (criticidadeOrder[afterAnalysis.gravidade] || 2) < (criticidadeOrder[beforeAnalysis.gravidade] || 2);

  const comparison = {
    antes: beforeAnalysis,
    depois: afterAnalysis,
    houve_melhoria: improved,
    resumo: improved ? 'Imagem após intervenção indica melhora visual da condição.' : 'Sem evidência clara de melhora visual após intervenção.',
  };

  persistAnalysis({
    osId: context.os_id || null,
    equipamentoId: context.equipamento_id || null,
    tipo: 'before_after',
    payload: comparison,
  });

  return comparison;
}

async function analisarImagemFalha({ fileBuffer = null, mimeType = 'image/jpeg', fileName = '', filePath = null } = {}) {
  const source = fileBuffer || (filePath ? require('fs').readFileSync(filePath) : null);
  if (!source) return defaultVisionPayload();
  const result = await analyzeEquipmentImage(Buffer.from(source).toString('base64'), {
    mimeType,
    context: { file_name: fileName || null },
  });

  return {
    tipo_falha: result.falha_provavel,
    criticidade: result.gravidade,
    recomendacao: (result.acoes_recomendadas || [])[0] || 'Executar inspeção detalhada.',
    componentes_afetados: result.componentes_afetados,
    acoes_recomendadas: result.acoes_recomendadas,
    observacoes: result.observacoes,
    confianca: result.confianca,
  };
}

module.exports = {
  analyzeEquipmentImage,
  analyzeOSImage,
  compareBeforeAfterImages,
  analisarImagemFalha,
};
