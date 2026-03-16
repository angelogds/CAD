const service = require('./demandas.service');

function index(req, res) {
  const status = (req.query.status || '').toString().trim();
  const lista = service.list({ status }, req.session?.user);

  return res.render('demandas/index', {
    title: 'Demandas',
    activeMenu: 'demandas',
    lista,
    status,
  });
}

function newForm(req, res) {
  return res.render('demandas/new', {
    title: 'Nova Demanda',
    activeMenu: 'demandas',
  });
}

function create(req, res) {
  try {
    const id = service.create({
      titulo: req.body.titulo,
      descricao: req.body.descricao,
      prioridade: req.body.prioridade,
      created_by: req.session?.user?.id,
    });
    req.flash('success', `Demanda #${id} criada.`);
    return res.redirect(`/demandas/${id}`);
  } catch (e) {
    req.flash('error', e.message || 'Erro ao criar demanda.');
    return res.redirect('/demandas/new');
  }
}

function show(req, res) {
  const id = Number(req.params.id);
  const demanda = service.getById(id);
  if (!demanda) return res.status(404).render('errors/404', { title: 'Não encontrado' });

  const role = String(req.session?.user?.role || '').toUpperCase();
  if (role !== 'ADMIN' && Number(req.session?.user?.id || 0) !== Number(demanda.created_by)) {
    req.flash('error', 'Você não tem permissão para ver esta demanda.');
    return res.redirect('/demandas');
  }

  return res.render('demandas/view', {
    title: `Demanda #${id}`,
    activeMenu: 'demandas',
    demanda,
    responsaveis: service.listResponsaveis(),
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

function convertToOS(req, res) {
  const id = Number(req.params.id);
  try {
    const osId = service.convertToOS(id, req.session?.user?.id || null);
    req.flash('success', `Demanda convertida em OS #${osId}.`);
    return res.redirect(`/os/${osId}`);
  } catch (e) {
    req.flash('error', e.message || 'Erro ao converter demanda.');
    return res.redirect(`/demandas/${id}`);
  }
}

module.exports = { index, newForm, create, show, updateStatus, addUpdate, convertToOS };
