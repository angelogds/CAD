const solicitacoesService = require('./solicitacoes.service');
const flowService = require('../compras/compras.itens-consenso.service');
const bilateralService = require('./solicitacoes.itens-bilateral.service');
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

function getContext(id, user) {
  const solicitacao = solicitacoesService.getSolicitacaoById(id);
  if (!solicitacao) throw new Error('Solicitação não encontrada');
  if (!solicitacoesService.canViewSolicitacao(solicitacao, user)) throw new Error('Sem permissão para esta solicitação.');
  return solicitacao;
}

function detalhe(req, res) {
  const id = Number(req.params.id);
  try {
    const solicitacao = getContext(id, req.session.user);
    let historicoExclusoes = [];
    let alteracoes = [];
    try { historicoExclusoes = flowService.getHistoricoExclusoes(id); } catch (_error) {}
    try { alteracoes = bilateralService.getAlteracoes(id); } catch (_error) {}
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
      canManageItems: !!bilateralService.actorSide(solicitacao, req.session.user),
      currentUserId: Number(req.session.user.id),
      alteracoes,
      historicoExclusoes,
      backUrl,
    });
  } catch (error) {
    if (error.message === 'Solicitação não encontrada') return res.status(404).send(error.message);
    if (error.message.startsWith('Sem permissão')) {
      req.flash('error', error.message);
      return res.redirect('/solicitacoes/minhas');
    }
    console.error('[solicitacoes.itens-consenso.detalhe]', error);
    return res.status(500).send('Não foi possível abrir esta solicitação. Verifique os dados ou contate o suporte.');
  }
}

function adicionarItem(req, res) {
  try {
    const solicitacao = getContext(Number(req.params.id), req.session.user);
    bilateralService.adicionarItem({ solicitacaoId: solicitacao.id, user: req.session.user, payload: req.body });
    req.flash('success', 'Material adicionado à mesma solicitação. O item entrou no fluxo individual de cotação sem alterar o andamento dos demais itens.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível adicionar o material.');
  }
  return res.redirect(`/solicitacoes/${req.params.id}#materiais-solicitacao`);
}

function solicitarAlteracao(req, res) {
  try {
    getContext(Number(req.params.id), req.session.user);
    bilateralService.solicitarAlteracao({ solicitacaoId: Number(req.params.id), itemId: Number(req.params.itemId), user: req.session.user, payload: req.body });
    req.flash('success', 'Alteração enviada para confirmação da outra parte. O item original permanece válido até a decisão.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível solicitar a alteração.');
  }
  return res.redirect(`/solicitacoes/${req.params.id}#materiais-solicitacao`);
}

function responderAlteracao(req, res, aprovar) {
  try {
    getContext(Number(req.params.id), req.session.user);
    bilateralService.responderAlteracao({ solicitacaoId: Number(req.params.id), itemId: Number(req.params.itemId), user: req.session.user, aprovar, observacao: req.body.observacao });
    req.flash('success', aprovar ? 'Alteração aprovada e aplicada ao item.' : 'Alteração recusada. Os dados atuais foram preservados.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível responder à alteração.');
  }
  return res.redirect(`/solicitacoes/${req.params.id}#consenso-itens`);
}

function solicitarExclusao(req, res) {
  try {
    getContext(Number(req.params.id), req.session.user);
    bilateralService.solicitarExclusao({ solicitacaoId: Number(req.params.id), itemId: Number(req.params.itemId), user: req.session.user, motivo: req.body.motivo });
    req.flash('success', 'Pedido de exclusão enviado para confirmação da outra parte. O item continua ativo até a decisão.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível solicitar a exclusão.');
  }
  return res.redirect(`/solicitacoes/${req.params.id}#materiais-solicitacao`);
}

function responderExclusao(req, res, aprovar) {
  try {
    getContext(Number(req.params.id), req.session.user);
    bilateralService.responderExclusao({ solicitacaoId: Number(req.params.id), itemId: Number(req.params.itemId), user: req.session.user, aprovar, observacao: req.body.observacao });
    req.flash('success', aprovar ? 'Exclusão confirmada por consenso. O item saiu do fluxo ativo e o histórico foi preservado.' : 'Pedido de exclusão recusado. O item continua ativo.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível responder ao pedido de exclusão.');
  }
  return res.redirect(`/solicitacoes/${req.params.id}#consenso-itens`);
}

function aprovarAlteracao(req, res) { return responderAlteracao(req, res, true); }
function recusarAlteracao(req, res) { return responderAlteracao(req, res, false); }
function aprovarExclusao(req, res) { return responderExclusao(req, res, true); }
function recusarExclusao(req, res) { return responderExclusao(req, res, false); }

module.exports = { detalhe, adicionarItem, solicitarAlteracao, aprovarAlteracao, recusarAlteracao, solicitarExclusao, aprovarExclusao, recusarExclusao };
