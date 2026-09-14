const db = require('../../database/db');
const push = require('../push/push.service');
const dateBr = require('../../utils/data-hora-br');
const { normalizeRole, ROLE } = require('../../config/rbac');

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

function userIdsByRoles(roles = []) {
  if (!tableExists('users')) return [];
  const allowed = new Set(roles.map(normalizeRole));
  try {
    return db.prepare(`
      SELECT id, role FROM users
      ORDER BY id
    `).all()
      .filter((row) => allowed.has(normalizeRole(row.role)))
      .map((row) => Number(row.id))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function operationalApproverUserIds() {
  return userIdsByRoles([
    ROLE.ADMIN,
    ROLE.ENCARREGADO_MANUTENCAO,
    ROLE.MANUTENCAO_SUPERVISOR,
    ROLE.SUPERVISOR_MANUTENCAO,
  ]);
}

function atestadoSensitiveUserIds() {
  return userIdsByRoles([ROLE.ADMIN, ROLE.RH]);
}

function maintenanceLeaderUserIds() {
  return userIdsByRoles([
    ROLE.ENCARREGADO_MANUTENCAO,
    ROLE.MANUTENCAO_SUPERVISOR,
    ROLE.SUPERVISOR_MANUTENCAO,
  ]);
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

function atestado(id) {
  if (!tableExists('rh_atestados')) return null;
  try {
    return db.prepare(`
      SELECT a.*, c.nome AS colaborador_nome
      FROM rh_atestados a
      JOIN colaboradores c ON c.id=a.colaborador_id
      WHERE a.id=? LIMIT 1
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
    for (const id of operationalApproverUserIds()) {
      await push.sendToUser(id, {
        title: 'Nova solicitação de folga',
        body: `${request.colaborador_nome} solicitou folga para ${request.data_folga}.`,
        type: 'ESCALA_FOLGA_SOLICITADA',
        url: '/escala/folgas',
        tag: `escala-folga-${request.id}`,
        data: { solicitacaoId: request.id, colaboradorId: request.colaborador_id, type: 'ESCALA_FOLGA_SOLICITADA' },
      });
    }

    for (const id of rhUserIds()) {
      await push.sendToUser(id, {
        title: 'Folga solicitada',
        body: `${request.colaborador_nome} solicitou folga para ${request.data_folga}.`,
        type: 'RH_FOLGA_SOLICITADA',
        url: '/rh/folgas',
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
        url: '/rh/folgas',
        tag: `rh-folga-rh-${request.id}`,
        data: { solicitacaoId: request.id, colaboradorId: request.colaborador_id, status: normalized, type: 'RH_FOLGA_DECISAO' },
      });
    }
  });
}

function notifyNewAtestado(atestadoId) {
  background('novo atestado', async () => {
    const item = atestado(atestadoId);
    if (!item) return;
    const periodo = item.data_inicio === item.data_fim
      ? dateBr.formatDateBR(item.data_inicio)
      : `${dateBr.formatDateBR(item.data_inicio)} a ${dateBr.formatDateBR(item.data_fim)}`;

    for (const id of atestadoSensitiveUserIds()) {
      await push.sendToUser(id, {
        title: '📄 Novo atestado médico',
        body: `${item.colaborador_nome} enviou atestado referente a ${periodo}.`,
        type: 'RH_ATESTADO_ENVIADO',
        url: '/rh/atestados',
        tag: `rh-atestado-${item.id}`,
        data: { atestadoId: item.id, colaboradorId: item.colaborador_id, type: 'RH_ATESTADO_ENVIADO' },
      });
    }

    for (const id of maintenanceLeaderUserIds()) {
      await push.sendToUser(id, {
        title: 'Afastamento informado',
        body: `${item.colaborador_nome} registrou atestado para ${periodo}. A ausência já foi lançada na Escala.`,
        type: 'ESCALA_ATESTADO_INFORMADO',
        url: '/escala/folgas',
        tag: `escala-atestado-${item.id}`,
        data: { colaboradorId: item.colaborador_id, inicio: item.data_inicio, fim: item.data_fim, type: 'ESCALA_ATESTADO_INFORMADO' },
      });
    }
  });
}

function notifyAtestadoStatus(atestadoId) {
  background('status de atestado', async () => {
    const item = atestado(atestadoId);
    if (!item?.user_id) return;
    const status = String(item.status || '').toUpperCase();
    await push.sendToUser(Number(item.user_id), {
      title: status === 'ARQUIVADO' ? 'Atestado arquivado pelo RH' : 'Atestado recebido pelo RH',
      body: status === 'ARQUIVADO'
        ? 'Seu atestado foi conferido e arquivado no RH.'
        : 'O RH registrou o recebimento do seu atestado.',
      type: 'RH_ATESTADO_STATUS',
      url: '/meu-portal/rh#atestados',
      tag: `rh-atestado-status-${item.id}`,
      data: { atestadoId: item.id, status, type: 'RH_ATESTADO_STATUS' },
    });
  });
}

module.exports = {
  notifyNewLeaveRequest,
  notifyLeaveDecision,
  notifyNewAtestado,
  notifyAtestadoStatus,
};
