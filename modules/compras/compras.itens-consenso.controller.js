const comprasService = require('./compras.service');
const flowService = require('./compras.itens-consenso.service');

function detalhe(req, res) {
  try {
    const id = Number(req.params.id);
    const base = comprasService.getSolicitacaoDetalhe(id);
    if (!base) return res.status(404).send('Solicitação não encontrada');
    const sol = flowService.enrichSolicitacaoDetalhe(base);
    let historicoExclusoes = [];
    try { historicoExclusoes = flowService.getHistoricoExclusoes(id); } catch (_error) {}
    return res.render('compras/solicitacoes/show', {
      title: `Compras ${sol.numero}`,
      activeMenu: 'compras',
      sol,
      fornecedores: comprasService.listFornecedoresAtivos(),
      historicoExclusoes,
      selectedSupplierId: Number(req.query?.fornecedor_selecionado) || null,
      selectedItemId: Number(req.query?.item_id) || null,
    });
  } catch (error) {
    console.error('[compras.itens-consenso.detalhe]', error);
    req.flash('error', error.message || 'Não foi possível abrir a solicitação de Compras.');
    return res.redirect('/compras/solicitacoes');
  }
}

function solicitarExclusao(req, res) {
  try {
    flowService.solicitarExclusao({
      solicitacaoId: Number(req.params.id),
      itemId: Number(req.params.itemId),
      userId: Number(req.session.user.id),
      motivo: req.body.motivo,
    });
    req.flash('success', 'Pedido de exclusão enviado ao solicitante. O item permanece ativo até a confirmação.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível solicitar a exclusão do item.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}`);
}

function cancelarExclusao(req, res) {
  try {
    flowService.cancelarPedidoExclusao({
      solicitacaoId: Number(req.params.id),
      itemId: Number(req.params.itemId),
      userId: Number(req.session.user.id),
    });
    req.flash('success', 'Pedido de exclusão cancelado. O item continua na solicitação.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível cancelar o pedido de exclusão.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}`);
}

function adicionarItem(req, res) {
  try {
    const result = flowService.adicionarItemExcepcional({
      solicitacaoId: Number(req.params.id),
      userId: Number(req.session.user.id),
      payload: req.body,
    });
    req.flash('success', result.modo === 'COMPRADO'
      ? 'Item excepcional adicionado e marcado como comprado. Ele seguirá para o mesmo fluxo de recebimento da solicitação.'
      : 'Item excepcional adicionado à solicitação e disponível para cotação.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível adicionar o item excepcional.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}#item-excepcional`);
}

module.exports = { detalhe, solicitarExclusao, cancelarExclusao, adicionarItem };
