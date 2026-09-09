const itemApprovalService = require('./compras.aprovacao-itens.service');

function rejectToPurchaseDetail(error, req, res) {
  req.flash('error', error.message || 'Os itens selecionados precisam de aprovação digital antes da compra.');
  return res.redirect(`/compras/solicitacoes/${Number(req.params.id)}`);
}

function requireApprovedPurchase(req, res, next) {
  try {
    itemApprovalService.assertAllQuotedApprovedForPurchase(Number(req.params.id));
    return next();
  } catch (error) {
    return rejectToPurchaseDetail(error, req, res);
  }
}

function requireApprovedPurchaseIntent(req, res, next) {
  if (String(req.body?.acao || '').toLowerCase() !== 'comprar') return next();
  try {
    itemApprovalService.assertItemsApprovedForPurchase(Number(req.params.id), req.body?.comprar);
    return next();
  } catch (error) {
    return rejectToPurchaseDetail(error, req, res);
  }
}

function blockExceptionalDirectPurchase(req, res, next) {
  if (String(req.body?.modo || '').toUpperCase() !== 'COMPRADO') return next();
  req.flash('error', 'O item excepcional deve entrar primeiro em cotação. Assim que fornecedor e valor forem definidos, ele aparecerá automaticamente para aprovação de ADMIN/DIRETORIA.');
  return res.redirect(`/compras/solicitacoes/${Number(req.params.id)}#item-excepcional`);
}

module.exports = {
  requireApprovedPurchase,
  requireApprovedPurchaseIntent,
  blockExceptionalDirectPurchase,
};
