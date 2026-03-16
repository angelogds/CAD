const db = require('../../database/db');

const KEYWORDS_EMERGENCIA = ['parado', 'sem funcionar', 'não funciona', 'nao funciona', 'fumaça', 'faisca', 'queimado', 'vazamento', 'risco', 'segurança', 'seguranca'];
const KEYWORDS_ALTA = ['urgente', 'travou', 'superaquec', 'quebra', 'vibração', 'vibracao', 'ruído', 'ruido'];

function aiHookAnalyze(_ctx) {
  // TODO: integrar com IA externa (LLM/API) e retornar { prioridade, categoria_sugerida, alertar_imediatamente }
  return null;
}

function countRecentFalhas(equipamentoId) {
  if (!equipamentoId) return 0;
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS total
      FROM os
      WHERE equipamento_id = ?
        AND UPPER(COALESCE(tipo,''))='CORRETIVA'
        AND datetime(opened_at) >= datetime('now','-30 day')
    `).get(Number(equipamentoId));
    return Number(row?.total || 0);
  } catch (_e) {
    return 0;
  }
}

function getCriticidadeEquipamento(equipamentoId) {
  if (!equipamentoId) return 'BAIXA';
  try {
    const row = db.prepare(`SELECT COALESCE(nivel_criticidade,'BAIXA') AS c FROM pcm_equipamento_criticidade WHERE equipamento_id=?`).get(Number(equipamentoId));
    return String(row?.c || 'BAIXA').toUpperCase();
  } catch (_e) {
    return 'BAIXA';
  }
}

function containsAny(text, list) {
  const t = String(text || '').toLowerCase();
  return list.some((w) => t.includes(w));
}

function classifyOSPriority({ descricao, tipo, equipamento_id }) {
  const criticidade = getCriticidadeEquipamento(equipamento_id);
  const falhasRecentes = countRecentFalhas(equipamento_id);

  const ctx = { descricao, tipo, equipamento_id, criticidade, falhasRecentes };

  const aiResult = aiHookAnalyze(ctx);
  if (aiResult && aiResult.prioridade) {
    return {
      prioridade: String(aiResult.prioridade).toUpperCase(),
      categoria_sugerida: aiResult.categoria_sugerida || null,
      alertar_imediatamente: Boolean(aiResult.alertar_imediatamente),
      fonte: 'IA',
    };
  }

  const txt = String(descricao || '');
  const tipoOS = String(tipo || 'CORRETIVA').toUpperCase();

  let prioridade = 'MEDIA';
  let categoria = null;

  if (containsAny(txt, ['elétr', 'eletric', 'disjuntor', 'curto'])) categoria = 'ELETRICA';
  else if (containsAny(txt, ['rolamento', 'mancal', 'eixo', 'vibra'])) categoria = 'MECANICA';
  else if (containsAny(txt, ['lubr', 'óleo', 'oleo', 'graxa'])) categoria = 'LUBRIFICACAO';

  const emergenciaTexto = containsAny(txt, KEYWORDS_EMERGENCIA);
  const altaTexto = containsAny(txt, KEYWORDS_ALTA);

  if (criticidade === 'ALTA' && (emergenciaTexto || tipoOS === 'CORRETIVA' && falhasRecentes >= 3)) {
    prioridade = 'EMERGENCIAL';
  } else if (emergenciaTexto || (criticidade === 'ALTA' && altaTexto) || falhasRecentes >= 4) {
    prioridade = 'ALTA';
  } else if (criticidade === 'BAIXA' && !altaTexto && tipoOS === 'PREVENTIVA') {
    prioridade = 'BAIXA';
  }

  const alertar_imediatamente = prioridade === 'EMERGENCIAL';

  return { prioridade, categoria_sugerida: categoria, alertar_imediatamente, fonte: 'REGRAS' };
}

module.exports = { classifyOSPriority };
