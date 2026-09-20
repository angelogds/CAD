const db = require('../../database/db');
const { STATUS } = require('../solicitacoes/solicitacoes.service');
const osChatService = require('../os-chat/os-chat.service');

const TRACKED_STATUS = new Set([
  STATUS.RECEBIDA_TOTAL,
  STATUS.SEPARADA_PARA_RETIRADA,
  STATUS.ENTREGUE_SOLICITANTE,
]);

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch { return false; }
}

function getResumoReservas(solicitacaoId) {
  if (!tableExists('estoque_reservas')) return { reservado: 0, retirado: 0, pendente: 0, reservas: 0 };
  const row = db.prepare(`
    SELECT
      COUNT(*) reservas,
      COALESCE(SUM(quantidade_reservada),0) reservado,
      COALESCE(SUM(quantidade_retirada),0) retirado
    FROM estoque_reservas
    WHERE solicitacao_id=? AND status<>'CANCELADA'
  `).get(Number(solicitacaoId)) || {};
  const reservado = Number(row.reservado || 0);
  const retirado = Number(row.retirado || 0);
  return {
    reservas: Number(row.reservas || 0),
    reservado,
    retirado,
    pendente: Math.max(reservado - retirado, 0),
  };
}

function getSolicitacao(solicitacaoId) {
  return db.prepare('SELECT id,numero,status,os_id FROM solicitacoes WHERE id=?').get(Number(solicitacaoId)) || null;
}

function registrarHistoricoOS(sol, status, userId) {
  if (!sol?.os_id) return;
  try {
    if (status === STATUS.SEPARADA_PARA_RETIRADA) {
      osChatService.registrarMensagemSistema(
        Number(sol.os_id),
        'MATERIAL_SEPARADO',
        `Solicitação ${sol.numero || '#' + sol.id}: material recebido e separado no Almoxarifado para retirada.`,
        { solicitacao_id: Number(sol.id), user_id: userId || null },
      );
    }
    if (status === STATUS.ENTREGUE_SOLICITANTE) {
      osChatService.registrarMensagemSistema(
        Number(sol.os_id),
        'MATERIAL_ENTREGUE',
        `Solicitação ${sol.numero || '#' + sol.id}: todos os materiais reservados foram entregues ao solicitante.`,
        { solicitacao_id: Number(sol.id), user_id: userId || null },
      );
    }
  } catch (error) {
    console.warn('[ESTOQUE_FLUXO][OS_CHAT]', error?.message || error);
  }
}

function syncSolicitacaoEntregaStatus(solicitacaoId, options = {}) {
  const sol = getSolicitacao(solicitacaoId);
  if (!sol) return { changed: false, status: null, resumo: getResumoReservas(solicitacaoId) };
  const atual = String(sol.status || '').toUpperCase();
  const resumo = getResumoReservas(solicitacaoId);

  if (!TRACKED_STATUS.has(atual) || !(resumo.reservado > 0)) {
    return { changed: false, status: atual, resumo };
  }

  const alvo = resumo.pendente <= 0
    ? STATUS.ENTREGUE_SOLICITANTE
    : STATUS.SEPARADA_PARA_RETIRADA;

  if (alvo === atual) return { changed: false, status: atual, resumo };

  db.prepare("UPDATE solicitacoes SET status=?,updated_at=datetime('now') WHERE id=? AND status=?")
    .run(alvo, Number(solicitacaoId), atual);

  const atualizado = getSolicitacao(solicitacaoId);
  const changed = String(atualizado?.status || '').toUpperCase() === alvo;
  if (changed) registrarHistoricoOS(atualizado, alvo, options.userId);

  return { changed, status: atualizado?.status || atual, resumo };
}

module.exports = {
  getResumoReservas,
  syncSolicitacaoEntregaStatus,
};
