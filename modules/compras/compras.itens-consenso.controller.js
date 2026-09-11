const comprasService = require('./compras.service');
const flowService = require('./compras.itens-consenso.service');
const approvalService = require('./compras.aprovacao.service');
const consensusNotificationService = require('./compras.consenso-notificacoes.service');
const bilateralService = require('../solicitacoes/solicitacoes.itens-bilateral.service');

function getSolicitacaoBase(id) {
  const base = comprasService.getSolicitacaoDetalhe(Number(id));
  if (!base) throw new Error('Solicitação não encontrada.');
  return base;
}

function detalhe(req, res) {
  try {
    const id = Number(req.params.id);
    const base = comprasService.getSolicitacaoDetalhe(id);
    if (!base) return res.status(404).send('Solicitação não encontrada');
    const sol = flowService.enrichSolicitacaoDetalhe(base);
    let historicoExclusoes = [];
    try { historicoExclusoes = flowService.getHistoricoExclusoes(id); } catch (_error) {}
    let aprovacao = null;
    try { aprovacao = approvalService.getContext(id); } catch (_error) {}
    return res.render('compras/solicitacoes/show', {
      title: `Compras ${sol.numero}`,
      activeMenu: 'compras',
      sol,
      fornecedores: comprasService.listFornecedoresAtivos(),
      historicoExclusoes,
      aprovacao,
      diretores: approvalService.listDirectors(),
      selectedSupplierId: Number(req.query?.fornecedor_selecionado) || null,
      selectedItemId: Number(req.query?.item_id) || null,
    });
  } catch (error) {
    console.error('[compras.itens-consenso.detalhe]', error);
    req.flash('error', error.message || 'Não foi possível abrir a solicitação de Compras.');
    return res.redirect('/compras/solicitacoes');
  }
}

function notificacoesConsensoJson(req, res) {
  try {
    const rows = consensusNotificationService.listPendingForPurchasing(req.session.user, 20);
    return res.json({ ok: true, total: rows.length, rows });
  } catch (error) {
    console.error('[compras.notificacoesConsensoJson]', error);
    return res.status(500).json({ ok: false, total: 0, rows: [] });
  }
}

function consensoItensJson(req, res) {
  try {
    const id = Number(req.params.id);
    const base = getSolicitacaoBase(id);
    const sol = flowService.enrichSolicitacaoDetalhe(base);
    const alteracoes = bilateralService.getAlteracoes(id);
    const pending = alteracoes.filter((row) => String(row.status || '').toUpperCase() === 'PENDENTE');
    const pendingByItem = new Map(pending.map((row) => [Number(row.solicitacao_item_id), row]));
    const side = bilateralService.actorSide(base, req.session.user);

    const itens = (Array.isArray(sol.itensAtivos) ? sol.itensAtivos : []).map((item) => ({
      id: Number(item.id),
      item_nome: item.item_nome || 'Item',
      qtd_solicitada: Number(item.qtd_solicitada || 0),
      unidade: item.unidade || 'UN',
      qtd_comprada: Number(item.qtd_comprada || 0),
      qtd_recebida_total: Number(item.qtd_recebida_total || 0),
      status_compra: String(item.status_compra || '').toUpperCase(),
      tem_alteracao_pendente: pendingByItem.has(Number(item.id)),
      pode_propor_por_compras: side === 'COMPRAS'
        && Number(item.qtd_recebida_total || 0) <= 0
        && String(item.status_compra || '').toUpperCase() !== 'CANCELADO'
        && !pendingByItem.has(Number(item.id)),
    }));

    return res.json({
      ok: true,
      solicitacao: {
        id: Number(base.id),
        numero: base.numero || `#${base.id}`,
        solicitante_user_id: Number(base.solicitante_user_id || 0),
      },
      lado_usuario: side,
      itens,
      pendentes: pending.map((row) => {
        const origemSolicitante = Number(row.solicitada_por_user_id) === Number(base.solicitante_user_id);
        return {
          id: Number(row.id),
          solicitacao_item_id: Number(row.solicitacao_item_id),
          item_nome: row.item_nome || 'Item',
          motivo: row.motivo || '',
          solicitada_por_user_id: Number(row.solicitada_por_user_id),
          solicitada_por_nome: row.solicitada_por_nome || 'Usuário',
          created_at: row.created_at || null,
          origem: origemSolicitante ? 'SOLICITANTE' : 'COMPRAS',
          destino: origemSolicitante ? 'COMPRAS' : 'SOLICITANTE',
          pode_responder: bilateralService.canAnswer(base, row.solicitada_por_user_id, req.session.user),
          snapshot: row.snapshot || {},
          proposta: row.proposta || {},
        };
      }),
    });
  } catch (error) {
    console.error('[compras.consensoItensJson]', error);
    const status = String(error.message || '').includes('não encontrada') ? 404 : 500;
    return res.status(status).json({ ok: false, error: error.message || 'Não foi possível carregar o consenso dos itens.' });
  }
}

function solicitarAlteracao(req, res) {
  try {
    const solicitacaoId = Number(req.params.id);
    const base = getSolicitacaoBase(solicitacaoId);
    if (bilateralService.actorSide(base, req.session.user) !== 'COMPRAS') {
      throw new Error('A proposta pelo painel de Compras precisa ser feita por outro usuário do setor de Compras. O solicitante original não pode representar os dois lados do consenso.');
    }
    bilateralService.solicitarAlteracao({
      solicitacaoId,
      itemId: Number(req.params.itemId),
      user: req.session.user,
      payload: req.body,
    });
    req.flash('success', 'Ajuste enviado ao solicitante. A quantidade atual permanece válida até a confirmação.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível solicitar a alteração do item.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}#consenso-itens`);
}

function responderAlteracao(req, res, aprovar) {
  try {
    getSolicitacaoBase(Number(req.params.id));
    bilateralService.responderAlteracao({
      solicitacaoId: Number(req.params.id),
      itemId: Number(req.params.itemId),
      user: req.session.user,
      aprovar,
      observacao: req.body.observacao,
    });
    req.flash('success', aprovar
      ? 'Alteração aprovada. A nova quantidade já está liberada para o fluxo de cotação/compra.'
      : 'Alteração recusada. A quantidade anterior foi mantida.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível responder à alteração.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}#consenso-itens`);
}

function aprovarAlteracao(req, res) { return responderAlteracao(req, res, true); }
function recusarAlteracao(req, res) { return responderAlteracao(req, res, false); }

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

module.exports = {
  detalhe,
  notificacoesConsensoJson,
  consensoItensJson,
  solicitarAlteracao,
  aprovarAlteracao,
  recusarAlteracao,
  solicitarExclusao,
  cancelarExclusao,
  adicionarItem,
};
