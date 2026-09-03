const service = require('./demandas.service');
const solicitacoesService = require('../solicitacoes/solicitacoes.service');

function normalizeChoice(value) {
  return String(value || '').trim().toUpperCase();
}

function index(req, res) {
  const filters = {
    q: String(req.query.q || '').trim(),
    status: normalizeChoice(req.query.status),
    prioridade: normalizeChoice(req.query.prioridade),
    responsavel_user_id: String(req.query.responsavel_user_id || '').trim(),
    tab: normalizeChoice(req.query.tab) || 'ATIVAS',
    limit: Number(req.query.limit || 20),
  };

  const lista = service.list(filters, req.session?.user);

  return res.render('demandas/index', {
    title: 'Demandas',
    activeMenu: 'demandas',
    lista,
    filters,
    painel: service.getPainel(req.session?.user),
    responsaveis: service.listResponsaveis(),
  });
}

function newForm(req, res) {
  const parentId = Number(req.query.parent_id || 0) || null;
  return res.render('demandas/new', {
    title: parentId ? 'Nova Subdemanda' : 'Nova Demanda',
    activeMenu: 'demandas',
    equipamentos: service.listEquipamentos(),
    parentCandidates: service.listParentCandidates(req.session?.user),
    categorias: service.CATEGORIAS,
    parentId,
  });
}

function create(req, res) {
  try {
    const id = service.create({
      titulo: req.body.titulo,
      descricao: req.body.descricao,
      prioridade: req.body.prioridade,
      demanda_pai_id: req.body.demanda_pai_id,
      equipamento_id: req.body.equipamento_id,
      categoria: req.body.categoria,
      setor_origem: req.body.setor_origem,
      nr_referencia: req.body.nr_referencia,
      prazo_previsto: req.body.prazo_previsto,
      custo_servicos_estimado: req.body.custo_servicos_estimado,
    }, req.session?.user || {});
    req.flash('success', `Demanda #${id} criada.`);
    return res.redirect(`/demandas/${id}`);
  } catch (e) {
    req.flash('error', e.message || 'Erro ao criar demanda.');
    const parentId = Number(req.body.demanda_pai_id || 0) || null;
    return res.redirect(parentId ? `/demandas/new?parent_id=${parentId}` : '/demandas/new');
  }
}

function show(req, res) {
  const id = Number(req.params.id);
  const demanda = service.getById(id);
  if (!demanda) return res.status(404).render('errors/404', { title: 'Não encontrado' });

  if (!service.canViewDemand(req.session?.user, demanda)) {
    req.flash('error', 'Você não tem permissão para ver esta demanda.');
    return res.redirect('/demandas');
  }

  return res.render('demandas/view', {
    title: `Demanda #${id}`,
    activeMenu: 'demandas',
    demanda,
    responsaveis: service.listResponsaveis(),
    equipamentos: service.listEquipamentos(),
    estoqueItens: solicitacoesService.listEstoqueItens(),
  });
}

function updateStatus(req, res) {
  const id = Number(req.params.id);
  try {
    service.updateStatus(id, {
      status: req.body.status,
      responsavel_user_id: req.body.responsavel_user_id,
      user_id: req.session?.user?.id || null,
    });
    req.flash('success', 'Status atualizado.');
  } catch (e) {
    req.flash('error', e.message || 'Erro ao atualizar status.');
  }
  return res.redirect(`/demandas/${id}`);
}

function updateApproval(req, res) {
  const id = Number(req.params.id);
  try {
    service.updateApproval(id, {
      aprovacao_status: req.body.aprovacao_status,
      user_id: req.session?.user?.id || null,
    });
    req.flash('success', 'Situação de aprovação atualizada.');
  } catch (e) {
    req.flash('error', e.message || 'Erro ao atualizar aprovação.');
  }
  return res.redirect(`/demandas/${id}`);
}

function addUpdate(req, res) {
  const id = Number(req.params.id);
  try {
    service.addUpdate(id, req.body.texto, req.session?.user?.id || null);
    req.flash('success', 'Atualização registrada.');
  } catch (e) {
    req.flash('error', e.message || 'Erro ao salvar atualização.');
  }
  return res.redirect(`/demandas/${id}`);
}

function addMaterials(req, res) {
  const id = Number(req.params.id);
  try {
    const itens = solicitacoesService.parseItensFromBody(req.body);
    const solicitacaoId = service.createMaterialPlanning(id, {
      user: req.session?.user || {},
      itens,
    });
    req.flash('success', `Planejamento de materiais criado na solicitação #${solicitacaoId} e enviado para pré-cotação em Compras.`);
  } catch (e) {
    req.flash('error', e.message || 'Erro ao criar planejamento de materiais.');
  }
  return res.redirect(`/demandas/${id}`);
}

async function convertToOS(req, res) {
  const id = Number(req.params.id);
  try {
    const osId = await service.convertToOS(id, req.session?.user?.id || null);
    req.flash('success', `Demanda vinculada à OS #${osId}. As solicitações existentes foram reaproveitadas sem duplicação.`);
    return res.redirect(`/os/${osId}`);
  } catch (e) {
    req.flash('error', e.message || 'Erro ao converter demanda.');
    return res.redirect(`/demandas/${id}`);
  }
}

module.exports = {
  index,
  newForm,
  create,
  show,
  updateStatus,
  updateApproval,
  addUpdate,
  addMaterials,
  convertToOS,
};
