const db = require('../../database/db');
const { ROLE, normalizeRole } = require('../../config/rbac');

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  } catch (_error) {
    return false;
  }
}

function parseJson(value) {
  try { return JSON.parse(value || '{}'); }
  catch (_error) { return {}; }
}

function canReceivePurchaseConsensus(user) {
  const role = normalizeRole(user?.role || user?.perfil);
  return role === ROLE.COMPRAS || role === ROLE.ADMIN;
}

function listPendingForPurchasing(user, limit = 20) {
  if (!user?.id || !canReceivePurchaseConsensus(user)) return [];
  if (!tableExists('solicitacao_item_alteracoes')) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const rows = db.prepare(`
    SELECT
      a.id,
      a.solicitacao_id,
      a.solicitacao_item_id,
      a.solicitada_por_user_id,
      a.motivo,
      a.proposta_json,
      a.snapshot_json,
      a.created_at,
      s.numero,
      s.solicitante_user_id,
      si.item_nome,
      us.name AS solicitada_por_nome
    FROM solicitacao_item_alteracoes a
    JOIN solicitacoes s ON s.id=a.solicitacao_id
    JOIN solicitacao_itens si ON si.id=a.solicitacao_item_id
    LEFT JOIN users us ON us.id=a.solicitada_por_user_id
    WHERE a.status='PENDENTE'
      AND a.solicitada_por_user_id=s.solicitante_user_id
      AND a.solicitada_por_user_id<>?
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ?
  `).all(Number(user.id), safeLimit);

  return rows.map((row) => ({
    id: Number(row.id),
    solicitacao_id: Number(row.solicitacao_id),
    solicitacao_item_id: Number(row.solicitacao_item_id),
    numero: row.numero || `#${row.solicitacao_id}`,
    item_nome: row.item_nome || 'Item',
    solicitada_por_nome: row.solicitada_por_nome || 'Solicitante',
    motivo: row.motivo || '',
    created_at: row.created_at || null,
    snapshot: parseJson(row.snapshot_json),
    proposta: parseJson(row.proposta_json),
  }));
}

module.exports = { listPendingForPurchasing };
