const service = require('./pre-solicitacoes.service');

function filtersFrom(req) {
  return {
    status: String(req.query.status || '').toUpperCase(),
    setor: String(req.query.setor || ''),
    semana: String(req.query.semana || '').toUpperCase(),
  };
}

function list(req, res) {
  const rows = service.listForUser(req.session.user, filtersFrom(req));
  return res.render('pre-solicitacoes/index', {
    title: 'Pré-Solicitações do Almoxarifado',
    activeMenu: 'pre-solicitacoes',
    rows,
    counters: service.counters(req.session.user),
    filters: filtersFrom(req),
    setorOptions: service.SETOR_OPTIONS,
    preStatus: service.PRE_STATUS,
    canCreate: service.isAlmoxUser(req.session.user),
  });
}

function nova(req, res) {
  if (!service.isAlmoxUser(req.session.user)) {
    req.flash('error', 'Somente o Almoxarifado pode abrir uma nova pré-solicitação.');
    return res.redirect('/pre-solicitacoes');
  }
  return res.render('pre-solicitacoes/form', {
    title: 'Nova Pré-Solicitação',
    activeMenu: 'pre-solicitacoes',
    ...service.formOptions(),
    actionUrl: '/pre-solicitacoes',
    formData: {
      setor_origem: '',
      semana_referencia: '',
      subarea_destino: '',
      observacao: '',
      prioridade: 'MEDIA',
    },
    formItens: [],
    editMode: false,
  });
}

function criar(req, res) {
  try {
    const created = service.create(req.body, req.session.user);
    req.flash('success', created.pre_status === service.PRE_STATUS.RASCUNHO
      ? 'Rascunho salvo com sucesso.'
      : 'Pré-solicitação enviada para análise do setor.');
    return res.redirect(`/pre-solicitacoes/${created.id}`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível criar a pré-solicitação.');
    return res.redirect('/pre-solicitacoes/nova');
  }
}

function editar(req, res) {
  const sol = service.getById(Number(req.params.id));
  if (!sol) return res.status(404).send('Pré-solicitação não encontrada.');
  if (!service.canEditDraft(sol, req.session.user)) {
    req.flash('error', 'Este rascunho não pode mais ser editado.');
    return res.redirect(`/pre-solicitacoes/${sol.id}`);
  }
  return res.render('pre-solicitacoes/form', {
    title: 'Editar Pré-Solicitação',
    activeMenu: 'pre-solicitacoes',
    ...service.formOptions(),
    actionUrl: `/pre-solicitacoes/${sol.id}/editar`,
    formData: {
      ...sol,
      observacao: sol.descricao || '',
    },
    formItens: sol.itens || [],
    editMode: true,
  });
}

function atualizar(req, res) {
  try {
    const updated = service.updateDraft(Number(req.params.id), req.body, req.session.user);
    req.flash('success', updated.pre_status === service.PRE_STATUS.RASCUNHO
      ? 'Rascunho atualizado.'
      : 'Pré-solicitação enviada para análise do setor.');
    return res.redirect(`/pre-solicitacoes/${updated.id}`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível atualizar o rascunho.');
    return res.redirect(`/pre-solicitacoes/${Number(req.params.id)}/editar`);
  }
}

function detalhe(req, res) {
  const sol = service.getById(Number(req.params.id));
  if (!sol) return res.status(404).send('Pré-solicitação não encontrada.');
  if (!service.canView(sol, req.session.user)) {
    req.flash('error', 'Sem permissão para visualizar esta pré-solicitação.');
    return res.redirect('/pre-solicitacoes');
  }
  return res.render('pre-solicitacoes/show', {
    title: sol.numero || 'Pré-Solicitação',
    activeMenu: 'pre-solicitacoes',
    sol,
    canReview: service.canReview(sol, req.session.user),
    canEdit: service.canEditDraft(sol, req.session.user),
    canAddItems: service.canAddItems(sol, req.session.user),
    estoqueItens: service.formOptions().estoqueItens,
    itemStatus: service.ITEM_STATUS,
    preStatus: service.PRE_STATUS,
  });
}

function adicionarItens(req, res) {
  try {
    const result = service.addItems(Number(req.params.id), req.body, req.session.user);
    req.flash('success', `${result.adicionados} material(is) adicionado(s) à pré-solicitação.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível adicionar os materiais.');
  }
  return res.redirect(`/pre-solicitacoes/${Number(req.params.id)}#adicionar-materiais`);
}

function decidirItem(req, res) {
  try {
    service.decideItem(Number(req.params.id), Number(req.params.itemId), req.body, req.session.user);
    req.flash('success', 'Decisão do item registrada.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a decisão.');
  }
  return res.redirect(`/pre-solicitacoes/${Number(req.params.id)}#itens`);
}

function finalizar(req, res) {
  try {
    const result = service.finalizeReview(Number(req.params.id), req.body, req.session.user);
    req.flash('success', result.pre_status === service.PRE_STATUS.ENVIADA_COMPRAS
      ? 'Pré-solicitação aprovada e liberada para o setor de Compras.'
      : 'Pré-solicitação encerrada sem itens aprovados.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível finalizar a análise.');
  }
  return res.redirect(`/pre-solicitacoes/${Number(req.params.id)}`);
}

module.exports = { list, nova, criar, editar, atualizar, detalhe, adicionarItens, decidirItem, finalizar };
