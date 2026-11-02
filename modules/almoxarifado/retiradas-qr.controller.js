const reservaService = require('../estoque/estoque.reservas.service');
const colaboradoresService = require('../colaboradores/colaboradores.service');
const { normalizeRole } = require('../../config/rbac');

function normNome(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

function cadastrarColaborador(req, res) {
  const nome = String(req.body.nome || '').trim().replace(/\s+/g, ' ');
  const funcao = String(req.body.funcao || 'COLABORADOR').trim().slice(0, 80);
  const setor = String(req.body.setor || 'NAO_INFORMADO').trim().slice(0, 80);
  const solicitacaoId = Number(req.body.solicitacao_id || 0) || null;
  const redirect = (params = '') => res.redirect('/almoxarifado/retiradas/qr' + params);
  try {
    if (nome.length < 3 || nome.length > 120) throw new Error('Informe o nome completo da pessoa (3 a 120 caracteres).');
    if (!/^[\p{L}][\p{L}\p{M}\s'.-]+$/u.test(nome)) throw new Error('Nome inválido para cadastro.');
    const existente = reservaService.listPessoasAtivas(nome).find(pessoa => normNome(pessoa.nome) === normNome(nome));
    if (existente) {
      req.flash('error', 'Essa pessoa já está cadastrada. Use o cadastro existente para evitar duplicidade.');
      const p = new URLSearchParams({ q_pessoa: nome });
      if (solicitacaoId) p.set('solicitacao_id', String(solicitacaoId));
      return redirect('?' + p.toString());
    }
    const id = colaboradoresService.createOrUpdateColaborador(
      { nome, funcao: funcao || 'COLABORADOR', setor: setor || 'NAO_INFORMADO', status: 'ATIVO' },
      { id: req.session.user.id, name: req.session.user.name, origem: 'ALMOXARIFADO_RETIRADA' }
    );
    req.flash('success', 'Cadastro para retirada criado. O cartão QR poderá ser emitido pelo RH ou encarregado autorizado.');
    const params = new URLSearchParams({ pessoa_tipo: 'COLABORADOR', pessoa_id: String(id) });
    if (solicitacaoId) params.set('solicitacao_id', String(solicitacaoId));
    return redirect('?' + params.toString());
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a pessoa.');
    const params = new URLSearchParams({ q_pessoa: nome });
    if (solicitacaoId) params.set('solicitacao_id', String(solicitacaoId));
    return redirect('?' + params.toString());
  }
}


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
    solicitacoes: reservaService.listSolicitacoes().filter(g => g.itens.some(i => Number(i.quantidade_disponivel) > 0)),
    historico: reservaService.historicoRetiradas(solicitacaoId),
    operacaoToken: require('node:crypto').randomUUID(),
    canWithdraw: require('../../config/rbac').ACCESS.estoque_retirada.includes(normalizeRole(req.session.user.role)),
    podeCadastrarPessoa: ['ADMIN','ALMOXARIFADO'].includes(normalizeRole(req.session.user.role)),
  });
}

function retirarLote(req, res) {
  const solicitacaoId = Number(req.params.id);
  const ids = Array.isArray(req.body.reserva_id) ? req.body.reserva_id : [req.body.reserva_id].filter(Boolean);
  let concluida = false;
  try {
    const resultado = reservaService.retirarSelecionados({ solicitacaoId, operacaoToken: req.body.operacao_token,
      itens: ids.map(id => ({ reservaId: id, quantidade: req.body[`quantidade_${id}`] })),
      qrCode: String(req.body.qr_code || '').trim(), pessoaTipo: req.body.pessoa_tipo, pessoaId: req.body.pessoa_id,
      nomeRetirante: req.body.nome_retirante, entreguePorUserId: req.session.user.id, observacao: req.body.observacao });
    concluida = true;
    req.flash('success', resultado.duplicado ? 'Esta retirada já foi registrada. O estoque foi mantido.'
      : `${resultado.itens} material(is) entregue(s) a ${resultado.pessoaNome}. Retirada registrada no histórico.`);
  } catch (error) { req.flash('error', error.message || 'Não foi possível confirmar a retirada. Nenhum item foi baixado.'); }
  const params = new URLSearchParams({solicitacao_id:String(solicitacaoId)});
  // Uma falha mantém a conferência atual. Uma entrega concluída limpa a pessoa
  // e abre o histórico, para que a próxima entrega exija nova identificação.
  if (!concluida) {
    if (req.body.qr_code) params.set('codigo', String(req.body.qr_code));
    else if (req.body.pessoa_tipo && req.body.pessoa_id) {
      params.set('pessoa_tipo', String(req.body.pessoa_tipo)); params.set('pessoa_id', String(req.body.pessoa_id));
    }
  }
  return res.redirect(`/almoxarifado/retiradas/qr?${params}#${concluida?'historico-retirada':'materiais-retirada'}`);
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
      nomeRetirante: String(req.body.nome_retirante || '').trim(),
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

module.exports = { scanner, retirar, retirarLote, cadastrarColaborador };
