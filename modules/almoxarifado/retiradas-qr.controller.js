const reservaService = require('../estoque/estoque.reservas.service');

function scanner(req, res) {
  const codigo = String(req.query.codigo || '').trim();
  const solicitacaoId = Number(req.query.solicitacao_id || 0) || null;
  const pessoaTipo = String(req.query.pessoa_tipo || '').trim().toUpperCase();
  const pessoaId = Number(req.query.pessoa_id || 0) || null;
  const buscaPessoa = String(req.query.q_pessoa || '').trim();
  const pessoa = codigo
    ? reservaService.getPessoaByQr(codigo)
    : (pessoaTipo && pessoaId ? reservaService.getPessoaByCadastro(pessoaTipo, pessoaId) : null);
  const pessoasEncontradas = buscaPessoa ? reservaService.listPessoasAtivas(buscaPessoa) : [];
  const grupos = reservaService.listSolicitacoes(solicitacaoId ? { solicitacao_id: solicitacaoId } : {});
  return res.render('almoxarifado/retirada_qr', {
    title: 'Retirada identificada',
    activeMenu: 'almoxarifado',
    codigo,
    solicitacaoId,
    pessoaTipo,
    pessoaId,
    buscaPessoa,
    pessoasEncontradas,
    pessoa,
    colaborador: pessoa,
    grupos,
  });
}

function retirar(req, res) {
  const reservaId = Number(req.params.reservaId);
  const codigo = String(req.body.qr_code || '').trim();
  const solicitacaoId = Number(req.body.solicitacao_id || 0) || null;
  const pessoaTipo = String(req.body.pessoa_tipo || '').trim().toUpperCase();
  const pessoaId = Number(req.body.pessoa_id || 0) || null;
  try {
    const resultado = reservaService.retirarReserva({
      reservaId,
      quantidade: Number(req.body.quantidade || 0),
      qrCode: codigo,
      pessoaTipo,
      pessoaId,
      entreguePorUserId: req.session.user.id,
      observacao: req.body.observacao || null,
      empresaConsumidora: req.body.empresa_consumidora,
      setorConsumidor: req.body.setor_consumidor,
    });
    req.flash('success', `${resultado.quantidade} unidade(s) entregues a ${resultado.pessoa?.nome || resultado.colaborador?.nome}. Estoque e reserva atualizados.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a retirada.');
  }
  const params = new URLSearchParams();
  if (codigo) params.set('codigo', codigo);
  if (!codigo && pessoaTipo && pessoaId) {
    params.set('pessoa_tipo', pessoaTipo);
    params.set('pessoa_id', String(pessoaId));
  }
  if (solicitacaoId) params.set('solicitacao_id', String(solicitacaoId));
  return res.redirect(`/almoxarifado/retiradas/qr?${params.toString()}`);
}

module.exports = { scanner, retirar };
