const db = require('../../database/db');
const push = require('../push/push.service');

function tableExists(name) {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
  catch (_error) { return false; }
}

function rhUserIds() {
  if (!tableExists('users')) return [];
  try {
    return db.prepare(`
      SELECT id FROM users
      WHERE UPPER(COALESCE(role,''))='RH'
      ORDER BY id
    `).all().map((r) => Number(r.id)).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function leaveRequest(id) {
  if (!tableExists('escala_folga_solicitacoes')) return null;
  try {
    return db.prepare(`
      SELECT s.*, c.nome AS colaborador_nome
      FROM escala_folga_solicitacoes s
      JOIN colaboradores c ON c.id=s.colaborador_id
      WHERE s.id=? LIMIT 1
    `).get(Number(id)) || null;
  } catch (_error) {
    return null;
  }
}

function background(label, work) {
  setImmediate(() => {
    Promise.resolve()
      .then(work)
      .catch((error) => console.warn(`[rh-notify] ${label}:`, error?.message || error));
  });
}

function notifyNewLeaveRequest(requestId) {
  background('nova solicitação de folga', async () => {
    const request = leaveRequest(requestId);
    if (!request) return;
    const users = rhUserIds();
    for (const id of users) {
      await push.sendToUser(id, {
        title: '🗓️ Nova solicitação de folga',
        body: `${request.colaborador_nome} solicitou folga para ${request.data_folga}.`,
        type: 'RH_FOLGA_SOLICITADA',
        url: '/escala/rh',
        tag: `rh-folga-${request.id}`,
        data: { solicitacaoId: request.id, colaboradorId: request.colaborador_id, type: 'RH_FOLGA_SOLICITADA' },
      });
    }
  });
}

function notifyLeaveDecision(requestId, status) {
  background('decisão de folga', async () => {
    const request = leaveRequest(requestId);
    if (!request) return;
    const normalized = String(status || request.status || '').toUpperCase();
    const approved = normalized === 'APROVADA';
    if (request.user_id) {
      await push.sendToUser(Number(request.user_id), {
        title: approved ? '✅ Folga aprovada' : '📋 Solicitação de folga atualizada',
        body: approved
          ? `Sua folga de ${request.data_folga} foi aprovada e registrada na Escala/Banco de Horas.`
          : `Sua solicitação de folga de ${request.data_folga} foi ${normalized === 'REPROVADA' ? 'reprovada' : 'atualizada'}.`,
        type: approved ? 'RH_FOLGA_APROVADA' : 'RH_FOLGA_REPROVADA',
        url: '/escala/meu-painel#solicitar-folga',
        tag: `rh-folga-decisao-${request.id}`,
        data: { solicitacaoId: request.id, status: normalized, type: 'RH_FOLGA_DECISAO' },
      });
    }

    for (const id of rhUserIds()) {
      await push.sendToUser(id, {
        title: approved ? '✅ Folga aprovada pela gestão' : 'ℹ️ Folga analisada pela gestão',
        body: `${request.colaborador_nome}: ${request.data_folga} • ${normalized}.`,
        type: 'RH_FOLGA_DECISAO',
        url: '/escala/rh',
        tag: `rh-folga-rh-${request.id}`,
        data: { solicitacaoId: request.id, colaboradorId: request.colaborador_id, status: normalized, type: 'RH_FOLGA_DECISAO' },
      });
    }
  });
}

module.exports = { notifyNewLeaveRequest, notifyLeaveDecision };
