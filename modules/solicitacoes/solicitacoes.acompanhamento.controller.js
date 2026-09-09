const acompanhamentoService = require('../compras/acompanhamento.service');
const approvalService = require('../compras/compras.aprovacao.service');

function detalhe(req, res) {
  try {
    const id = Number(req.params.id);
    const detalheCompra = acompanhamentoService.getDetail(id);
    if (!detalheCompra) return res.status(404).send('Solicitação não encontrada.');

    return res.render('solicitacoes/acompanhamento-detalhe', {
      title: `Acompanhamento ${detalheCompra.numero || '#' + detalheCompra.id}`,
      activeMenu: 'solicitacoes',
      detalheCompra,
      canDirectorApprove: approvalService.canCurrentDirectorDecide(detalheCompra.aprovacao, req.session?.user),
    });
  } catch (error) {
    console.error('[solicitacoes.acompanhamento.detalhe]', error);
    req.flash('error', error.message || 'Não foi possível abrir o acompanhamento desta solicitação.');
    return res.redirect('/solicitacoes/acompanhamento-compras');
  }
}

function aprovar(req, res) {
  const id = Number(req.params.id);
  try {
    approvalService.approve(id, req.session?.user || {}, req.body.observacao);
    req.flash('success', 'Compra aprovada pela Diretoria. O setor de Compras já pode efetivar a compra dentro dos valores aprovados.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível aprovar esta compra.');
  }
  return res.redirect(`/solicitacoes/acompanhamento-compras/${id}`);
}

function reprovar(req, res) {
  const id = Number(req.params.id);
  try {
    approvalService.reject(id, req.session?.user || {}, req.body.motivo);
    req.flash('success', 'Cotação devolvida/reprovada pela Diretoria. O motivo ficou registrado no histórico.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a reprovação.');
  }
  return res.redirect(`/solicitacoes/acompanhamento-compras/${id}`);
}

module.exports = { detalhe, aprovar, reprovar };
