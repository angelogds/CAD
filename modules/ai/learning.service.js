const db = require('../../database/db');
const iaRepository = require('../ia/ia.repository');

function extractEquipmentId(texto = '') {
  const idMatch = String(texto || '').match(/(?:equipamento|eq)\s*#?\s*(\d+)/i);
  return idMatch ? Number(idMatch[1]) : null;
}

function getSimilarOS(texto = '', opts = {}) {
  const textoBase = String(texto || '').trim();
  if (!textoBase) return [];

  const equipamentoId = Number(opts.equipamento_id || extractEquipmentId(textoBase) || 0) || null;
  const similares = iaRepository.buscarHistoricoSemelhante({
    equipamento_id: equipamentoId,
    texto_base: textoBase,
    limite: Number(opts.limit || 6),
  });

  return (similares || []).map((item) => ({
    os_id: Number(item.id || 0),
    descricao: String(item.descricao || ''),
    causa: String(item.causa_diagnostico || item.ai_causa_provavel || ''),
    solucao: String(item.resumo_tecnico || item.ai_acao_corretiva_sugerida || item.ai_servico_sugerido || ''),
    status: String(item.status || ''),
    score: Number(item.score_similaridade || 0),
  })).filter((item) => item.os_id);
}

module.exports = {
  getSimilarOS,
};
