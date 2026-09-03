const solicitacoesService = require('./solicitacoes.service');
const flowService = require('../compras/compras.itens-consenso.service');
const { fallback, normalizeSolicitacaoForView } = require('./solicitacoes.presenter');

function normalizeItens(itens) {
  return (Array.isArray(itens) ? itens : []).map((item) => ({
    ...item,
    item_nome: fallback(item.item_nome || item.item_descricao),
    unidade: fallback(item.unidade, 'UN'),
    qtd_solicitada: item.qtd_solicitada ?? item.quantidade ?? 0,
    item_descricao: fallback(item.item_descricao || item.observacao_item, 'Não informado'),
  }));
}

function detalhe(req, res) {
  const id = Number(req.params.id);
  try {
    const solicitacao = solicitacoesService.getSolicitacaoById(id);
    if (!solicitacao) return res.status(404).send('Solicitação não encontrada');
    if (!solicitacoesService.canViewSolicitacao(solicitacao, req.session.user)) {
      req.flash('error', 'Sem permissão para esta solicitação.');
      return res.redirect('/solicitacoes/minhas');
    }

    let historicoExclusoes = [];
    try { historicoExclusoes = flowService.getHistoricoExclusoes(id); } catch (_error) {}
    const itens = Array.isArray(solicitacao.itens) ? solicitacao.itens : [];
    const backUrl = req.query.from === 'compras' ? '/compras/solicitacoes' : '/solicitacoes/minhas';
    return res.render('solicitacoes/show', {
      title: 'Solicitação',
      activeMenu: 'solicitacoes',
      solicitacao: normalizeSolicitacaoForView(solicitacao),
      itens: normalizeItens(itens),
      anexos: Array.isArray(solicitacao.anexos) ? solicitacao.anexos : [],
      canEdit: solicitacoesService.canEditSolicitacao(solicitacao, req.session.user),
      isRequester: Number(solicitacao.solicitante_user_id) === Number(req.session.user.id),
      historicoExclusoes,
      backUrl,
    });
  } catch (error) {
    console.error('[solicitacoes.itens-consenso.detalhe]', error);
    return res.status(500).send('Não foi possível abrir esta solicitação. Verifique os dados ou contate o suporte.');
  }
}

function aprovarExclusao(req, res) {
  try {
    flowService.responderExclusao({
      solicitacaoId: Number(req.params.id),
      itemId: Number(req.params.itemId),
      userId: Number(req.session.user.id),
      aprovar: true,
      observacao: req.body.observacao,
    });
    req.flash('success', 'Exclusão confirmada. O item saiu do fluxo ativo de Compras, mas o histórico foi preservado.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível confirmar a exclusão.');
  }
  return res.redirect(`/solicitacoes/${req.params.id}`);
}

function recusarExclusao(req, res) {
  try {
    flowService.responderExclusao({
      solicitacaoId: Number(req.params.id),
      itemId: Number(req.params.itemId),
      userId: Number(req.session.user.id),
      aprovar: false,
      observacao: req.body.observacao,
    });
    req.flash('success', 'Pedido de exclusão recusado. O item continuará ativo na solicitação.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível responder ao pedido de exclusão.');
  }
  return res.redirect(`/solicitacoes/${req.params.id}`);
}

module.exports = { detalhe, aprovarExclusao, recusarExclusao };
