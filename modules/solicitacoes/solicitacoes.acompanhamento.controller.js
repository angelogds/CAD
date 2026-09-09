const acompanhamentoService = require('../compras/acompanhamento.service');
const itemApprovalService = require('../compras/compras.aprovacao-itens.service');

const HIGHLIGHTS = new Set(['aprovacao', 'cotacao', 'compra', 'recebimento', 'atrasadas']);

function nextAction(row) {
  if (row.concluidaFluxo) return 'CONCLUIDA';
  const approvalItems = Array.isArray(row.aprovacaoItens?.itens) ? row.aprovacaoItens.itens : [];
  const semCotacaoReal = approvalItems.filter((item) => String(item.approvalState || '').toUpperCase() === 'SEM_COTACAO').length;
  if (Number(row.aprovacaoItens?.pendentesCount || 0) > 0) return 'AGUARDANDO_APROVACAO';
  if (semCotacaoReal > 0 || (!approvalItems.length && Number(row.semCotacao || 0) > 0)) return 'COTACAO_NECESSARIA';
  if (Number(row.aprovacaoItens?.aprovadosCount || 0) > 0) return 'EFETIVAR_COMPRA';
  if (Number(row.comprados || 0) > Number(row.recebidos || 0)) {
    return Number(row.recebidos || 0) > 0 ? 'RECEBIMENTO_PARCIAL' : 'AGUARDANDO_RECEBIMENTO';
  }
  return 'EM_ACOMPANHAMENTO';
}

function executiveRank(row) {
  if (row.proximaAcao === 'AGUARDANDO_APROVACAO') return 0;
  if (row.priorityGroup === 'critical') return 1;
  if (row.atrasada) return 2;
  if (row.proximaAcao === 'COTACAO_NECESSARIA') return 3;
  if (row.proximaAcao === 'EFETIVAR_COMPRA') return 4;
  if (['AGUARDANDO_RECEBIMENTO', 'RECEBIMENTO_PARCIAL'].includes(row.proximaAcao)) return 5;
  return 6;
}

function matchesHighlight(row, highlight) {
  if (!highlight) return true;
  if (highlight === 'aprovacao') return row.proximaAcao === 'AGUARDANDO_APROVACAO';
  if (highlight === 'cotacao') return row.proximaAcao === 'COTACAO_NECESSARIA';
  if (highlight === 'compra') return row.proximaAcao === 'EFETIVAR_COMPRA';
  if (highlight === 'recebimento') return ['AGUARDANDO_RECEBIMENTO', 'RECEBIMENTO_PARCIAL'].includes(row.proximaAcao);
  if (highlight === 'atrasadas') return Boolean(row.atrasada);
  return true;
}

function enrichDashboardWithApprovals(painel, query = {}) {
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
    row.proximaAcao = nextAction(row);
  });

  painel.aprovacaoItens = { solicitacoesPendentes, itensPendentes, valorPendente };
  painel.executivo = {
    semCotacaoItens: rows.reduce((sum, row) => {
      const itens = Array.isArray(row.aprovacaoItens?.itens) ? row.aprovacaoItens.itens : [];
      if (!itens.length) return sum + Number(row.semCotacao || 0);
      return sum + itens.filter((item) => String(item.approvalState || '').toUpperCase() === 'SEM_COTACAO').length;
    }, 0),
    aprovadasAguardandoCompra: rows.filter((row) => row.proximaAcao === 'EFETIVAR_COMPRA').length,
    aguardandoRecebimento: rows.filter((row) => ['AGUARDANDO_RECEBIMENTO', 'RECEBIMENTO_PARCIAL'].includes(row.proximaAcao)).length,
    atrasadas: rows.filter((row) => row.atrasada).length,
    valorAguardandoAprovacao: valorPendente,
    valorComprado: rows.reduce((sum, row) => sum + Number(row.comprometidoCentavos || 0), 0),
    saldoReceber: rows.reduce((sum, row) => sum + Math.max(0, Number(row.comprometidoCentavos || 0) - Number(row.recebidoCentavos || 0)), 0),
  };

  const highlight = HIGHLIGHTS.has(String(query.destaque || '').toLowerCase()) ? String(query.destaque).toLowerCase() : '';
  painel.destaque = highlight;

  if (painel.filters?.visao === 'historico') {
    rows.sort((a, b) => String(b.dataReferencia || '').localeCompare(String(a.dataReferencia || '')) || Number(b.id) - Number(a.id));
  } else {
    rows.sort((a, b) => executiveRank(a) - executiveRank(b)
      || String(b.created_at || '').localeCompare(String(a.created_at || ''))
      || Number(b.id) - Number(a.id));
  }

  painel.solicitacoes = rows.filter((row) => matchesHighlight(row, highlight));
  return painel;
}

function lista(req, res) {
  try {
    const painel = enrichDashboardWithApprovals(acompanhamentoService.getDashboard(req.query), req.query);
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
    const ids = (Array.isArray(req.body?.item_id) ? req.body.item_id : [req.body?.item_id])
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);
    if (!ids.length) {
      const error = new Error('Selecione ao menos um item cotado para aprovação.');
      error.code = 'APROVACAO_ITEM_SELECAO_OBRIGATORIA';
      throw error;
    }
    itemApprovalService.approveQuotedItems(id, ids, req.session?.user || {});
    req.flash('success', 'Itens selecionados aprovados e liberados para Compras.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível aprovar os itens cotados.');
  }
  return res.redirect(`/solicitacoes/acompanhamento-compras/${id}`);
}

module.exports = { lista, detalhe, aprovarItensCotados, enrichDashboardWithApprovals, nextAction };
