const db = require('../../database/db');

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  } catch (_error) {
    return false;
  }
}

function asIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) => Number(item)).filter((id) => Number.isInteger(id) && id > 0))];
}

function findPending(solicitacaoId, itemIds = null) {
  if (!tableExists('solicitacao_item_alteracoes')) return [];
  const id = Number(solicitacaoId);
  if (!id) return [];

  if (Array.isArray(itemIds)) {
    if (!itemIds.length) return [];
    const placeholders = itemIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT a.solicitacao_item_id, si.item_nome
      FROM solicitacao_item_alteracoes a
      JOIN solicitacao_itens si ON si.id=a.solicitacao_item_id
      WHERE a.solicitacao_id=? AND a.status='PENDENTE'
        AND a.solicitacao_item_id IN (${placeholders})
      ORDER BY a.id DESC
    `).all(id, ...itemIds);
  }

  return db.prepare(`
    SELECT a.solicitacao_item_id, si.item_nome
    FROM solicitacao_item_alteracoes a
    JOIN solicitacao_itens si ON si.id=a.solicitacao_item_id
    WHERE a.solicitacao_id=? AND a.status='PENDENTE'
    ORDER BY a.id DESC
  `).all(id);
}

function redirectWithPending(req, res, rows) {
  const names = rows.map((row) => row.item_nome || `item #${row.solicitacao_item_id}`).slice(0, 3);
  const suffix = rows.length > names.length ? ` e mais ${rows.length - names.length}` : '';
  req.flash(
    'error',
    `Compra bloqueada: existe alteração de quantidade aguardando consenso em ${names.join(', ')}${suffix}. Aprove ou recuse a alteração antes de efetivar a compra.`
  );
  return res.redirect(`/compras/solicitacoes/${req.params.id}#consenso-itens`);
}

function blockAnyPendingAlteration(req, res, next) {
  try {
    const rows = findPending(Number(req.params.id));
    if (rows.length) return redirectWithPending(req, res, rows);
    return next();
  } catch (error) {
    console.error('[compras.consenso.blockAnyPendingAlteration]', error);
    req.flash('error', 'Não foi possível validar alterações pendentes dos itens. A compra não foi efetivada.');
    return res.redirect(`/compras/solicitacoes/${req.params.id}`);
  }
}

function blockSelectedPendingAlteration(req, res, next) {
  try {
    const wantsPurchase = String(req.body?.acao || '').toLowerCase() === 'comprar';
    const stockIds = asIds(req.body?.atendido_estoque);
    if (!wantsPurchase && !stockIds.length) return next();

    const selectedIds = [...new Set([
      ...(wantsPurchase ? asIds(req.body?.comprar) : []),
      ...stockIds,
    ])];
    if (!selectedIds.length) return next();

    const rows = findPending(Number(req.params.id), selectedIds);
    if (rows.length) return redirectWithPending(req, res, rows);
    return next();
  } catch (error) {
    console.error('[compras.consenso.blockSelectedPendingAlteration]', error);
    req.flash('error', 'Não foi possível validar o consenso dos itens selecionados. Nenhuma compra foi efetivada.');
    return res.redirect(`/compras/solicitacoes/${req.params.id}`);
  }
}

module.exports = {
  asIds,
  findPending,
  blockAnyPendingAlteration,
  blockSelectedPendingAlteration,
};
