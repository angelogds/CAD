const acompanhamentoService = require('../compras/acompanhamento.service');
const itemApprovalService = require('../compras/compras.aprovacao-itens.service');

function enrichDashboardWithApprovals(painel) {
  const rows = Array.isArray(painel?.solicitacoes) ? painel.solicitacoes : [];
  let itensPendentes = 0;
  let valorPendente = 0;
  let solicitacoesPendentes = 0;

  rows.forEach((row) => {
    try {
      row.aprovacaoItens = itemApprovalService.getSummary(row.id);
    } catch (_error) {
      row.aprovacaoItens = { pendentesCount: 0, aprovadosCount: 0, pendentesValorCentavos: 0, temPendencias: false };
    }
    if (row.aprovacaoItens.temPendencias) solicitacoesPendentes += 1;
    itensPendentes += Number(row.aprovacaoItens.pendentesCount || 0);
    valorPendente += Number(row.aprovacaoItens.pendentesValorCentavos || 0);
  });

  painel.aprovacaoItens = { solicitacoesPendentes, itensPendentes, valorPendente };
  return painel;
}

function lista(req, res) {
  try {
    const painel = enrichDashboardWithApprovals(acompanhamentoService.getDashboard(req.query));
    return res.render('solicitacoes/acompanhamento-compras', {
      title: 'Acompanhamento de Compras',
      activeMenu: 'solicitacoes',
      painel,
    });
  } catch (error) {
    console.error('[solicitacoes.acompanhamento.lista]', error);
    req.flash('error', error.message || 'Não foi possível carregar o acompanhamento de compras.');
    return res.redirect('/solicitacoes/minhas');
  }
}

function normalizeLegacyPurchasedQuantities(detalheCompra) {
  const itens = Array.isArray(detalheCompra?.itens) ? detalheCompra.itens : [];
  itens.forEach((item) => {
    const purchased = String(item.status_compra || '').toUpperCase() === 'COMPRADO';
    if (purchased && Number(item.qtdComprada || 0) <= 0) {
      item.qtdComprada = Number(item.qtdSolicitada || 0);
      item.qtdPendenteReceber = Math.max(0, item.qtdComprada - Number(item.qtdRecebida || 0));
      item.compradoCentavos = Math.round(item.qtdComprada * Number(item.valor_unitario_centavos || 0));
    }
  });
  if (detalheCompra?.resumoAcompanhamento) {
    detalheCompra.resumoAcompanhamento.compradoCentavos = itens.reduce((sum, item) => sum + Number(item.compradoCentavos || 0), 0);
  }
  return detalheCompra;
}

function detalhe(req, res) {
  try {
    const id = Number(req.params.id);
    const detalheCompra = normalizeLegacyPurchasedQuantities(acompanhamentoService.getDetail(id));
    if (!detalheCompra) return res.status(404).send('Solicitação não encontrada.');

    let approvalSummary;
    try { approvalSummary = itemApprovalService.getSummary(id); }
    catch (_error) { approvalSummary = { itens: [], pendentes: [], aprovados: [], pendentesCount: 0, aprovadosCount: 0, pendentesValorCentavos: 0, temPendencias: false }; }
    const approvalByItem = new Map((approvalSummary.itens || []).map((item) => [Number(item.id), item]));
    detalheCompra.itens = (detalheCompra.itens || []).map((item) => ({ ...item, ...(approvalByItem.get(Number(item.id)) || {}) }));

    return res.render('solicitacoes/acompanhamento-detalhe', {
      title: `Acompanhamento ${detalheCompra.numero || '#' + detalheCompra.id}`,
      activeMenu: 'solicitacoes',
      detalheCompra,
      approvalSummary,
      approvalHistory: itemApprovalService.getHistory(id),
      canApproveItems: itemApprovalService.canApprove(req.session?.user),
    });
  } catch (error) {
    console.error('[solicitacoes.acompanhamento.detalhe]', error);
    req.flash('error', error.message || 'Não foi possível abrir o acompanhamento desta solicitação.');
    return res.redirect('/solicitacoes/acompanhamento-compras');
  }
}

function aprovarItensCotados(req, res) {
  const id = Number(req.params.id);
  try {
    const ids = Array.isArray(req.body?.item_id) ? req.body.item_id : [req.body?.item_id].filter(Boolean);
    const result = itemApprovalService.approveQuotedItems(id, ids, req.session?.user || {});
    req.flash('success', `Aprovação registrada. ${result.aprovadosCount} item(ns) cotado(s) estão liberados para Compras.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível aprovar os itens cotados.');
  }
  return res.redirect(`/solicitacoes/acompanhamento-compras/${id}`);
}

module.exports = { lista, detalhe, aprovarItensCotados };
