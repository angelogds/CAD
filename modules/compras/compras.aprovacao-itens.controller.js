const itemApprovalService = require('./compras.aprovacao-itens.service');
const releasedDashboardService = require('./compras.liberados-dashboard.service');

function statusJson(req, res) {
  try {
    const solicitacaoId = Number(req.params.id);
    const summary = itemApprovalService.getSummary(solicitacaoId);
    return res.json({
      ok: true,
      pendentes: summary.pendentesCount,
      aprovados: summary.aprovadosCount,
      valor_pendente_centavos: summary.pendentesValorCentavos,
      itens: summary.itens.map((item) => ({
        id: Number(item.id),
        approvalState: item.approvalState,
        approvalStale: Boolean(item.approvalStale),
        aprovado_por: item.aprovacao_por_nome || null,
      })),
    });
  } catch (error) {
    console.error('[compras.aprovacao-itens.statusJson]', error);
    return res.status(500).json({ ok: false, error: error.message || 'Não foi possível consultar a aprovação dos itens.' });
  }
}

function liberadosDashboardJson(_req, res) {
  try {
    const summary = releasedDashboardService.listDashboardStatus();
    return res.json({
      ok: true,
      rows: summary.rows,
      total_solicitacoes_liberadas: summary.totalSolicitacoesLiberadas,
      total_itens_liberados: summary.totalItensLiberados,
      total_itens_aguardando: summary.totalItensAguardando,
    });
  } catch (error) {
    console.error('[compras.aprovacao-itens.liberadosDashboardJson]', error);
    return res.status(500).json({ ok: false, rows: [], error: error.message || 'Não foi possível consultar os itens liberados para compra.' });
  }
}

module.exports = { statusJson, liberadosDashboardJson };
