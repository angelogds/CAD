const itemApprovalService = require('./compras.aprovacao-itens.service');

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

module.exports = { statusJson };
