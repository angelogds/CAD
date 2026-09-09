const approvalService = require('./compras.aprovacao.service');

function rejectToPurchaseDetail(error, req, res) {
  req.flash('error', error.message || 'A compra precisa de aprovação da Diretoria antes de ser efetivada.');
  return res.redirect(`/compras/solicitacoes/${Number(req.params.id)}`);
}

function requireApprovedPurchase(req, res, next) {
  try {
    approvalService.assertCompraAprovada(Number(req.params.id));
    return next();
  } catch (error) {
    return rejectToPurchaseDetail(error, req, res);
  }
}

function requireApprovedPurchaseIntent(req, res, next) {
  if (String(req.body?.acao || '').toLowerCase() !== 'comprar') return next();
  return requireApprovedPurchase(req, res, next);
}

function blockExceptionalDirectPurchase(req, res, next) {
  if (String(req.body?.modo || '').toUpperCase() !== 'COMPRADO') return next();
  req.flash('error', 'Para manter a aprovação da Diretoria válida, o item excepcional deve ser incluído primeiro para cotação. Depois, reenvie a solicitação para aprovação antes de efetivar a compra.');
  return res.redirect(`/compras/solicitacoes/${Number(req.params.id)}#item-excepcional`);
}

module.exports = {
  requireApprovedPurchase,
  requireApprovedPurchaseIntent,
  blockExceptionalDirectPurchase,
};
