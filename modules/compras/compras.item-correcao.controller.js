const service = require('./compras.item-correcao.service');

function corrigirItemCompra(req, res) {
  const solicitacaoId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  try {
    service.corrigirItemCompra(solicitacaoId, itemId, req.body, req.session.user.id);
    req.flash('success', 'Item corrigido. Cotação, compra e total da solicitação foram recalculados.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível corrigir o item da compra.');
  }
  return res.redirect(`/compras/solicitacoes/${solicitacaoId}`);
}

module.exports = { corrigirItemCompra };
