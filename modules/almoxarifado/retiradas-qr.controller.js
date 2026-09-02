const reservaService = require('../estoque/estoque.reservas.service');

function scanner(req, res) {
  const codigo = String(req.query.codigo || '').trim();
  const solicitacaoId = Number(req.query.solicitacao_id || 0) || null;
  const colaborador = codigo ? reservaService.getColaboradorByQr(codigo) : null;
  const grupos = reservaService.listSolicitacoes(solicitacaoId ? { solicitacao_id: solicitacaoId } : {});
  return res.render('almoxarifado/retirada_qr', {
    title: 'Retirada por QR',
    activeMenu: 'almoxarifado',
    codigo,
    solicitacaoId,
    colaborador,
    grupos,
  });
}

function retirar(req, res) {
  const reservaId = Number(req.params.reservaId);
  const codigo = String(req.body.qr_code || '').trim();
  const solicitacaoId = Number(req.body.solicitacao_id || 0) || null;
  try {
    const resultado = reservaService.retirarReserva({
      reservaId,
      quantidade: Number(req.body.quantidade || 0),
      qrCode: codigo,
      entreguePorUserId: req.session.user.id,
      observacao: req.body.observacao || null,
    });
    req.flash('success', `${resultado.quantidade} unidade(s) entregues a ${resultado.colaborador.nome}. Estoque e reserva atualizados.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a retirada.');
  }
  const params = new URLSearchParams();
  if (codigo) params.set('codigo', codigo);
  if (solicitacaoId) params.set('solicitacao_id', String(solicitacaoId));
  return res.redirect(`/almoxarifado/retiradas/qr?${params.toString()}`);
}

module.exports = { scanner, retirar };
