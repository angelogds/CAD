const service = require('./desenho-tecnico.service');
const { validateDrawingInput } = require('./desenho-tecnico.validators');
const equipamentosService = require('../equipamentos/equipamentos.service');
const cadService = require('./desenho-tecnico.cad.service');

function base(res, view, payload = {}) {
  return res.render(view, {
    title: payload.title || 'Desenho Técnico',
    activeMenu: 'desenho-tecnico',
    user: payload.user || null,
    canManage: Boolean(payload.canManage),
    desenho: payload.desenho || {},
    equipamentos: Array.isArray(payload.equipamentos) ? payload.equipamentos : [],
    categorias: Array.isArray(payload.categorias) ? payload.categorias : [],
    subtipos: Array.isArray(payload.subtipos) ? payload.subtipos : [],
    revisoes: Array.isArray(payload.revisoes) ? payload.revisoes : [],
    ...payload,
  });
}

function logCad(route, message, meta = {}) {
  console.log('[CAD]', route, message, {
    params: meta.params || {},
    body: meta.body || {},
    id: meta.id || null,
    view: meta.view || null,
    extra: meta.extra || null,
  });
}

function logCadError(route, err, req, extra = {}) {
  console.error('[CAD][ERROR]', {
    route,
    message: err?.message || String(err),
    stack: err?.stack || null,
    params: req?.params || {},
    body: req?.body || {},
    extra,
  });
}

function safeEquipamentos() {
  const items = equipamentosService.list();
  return Array.isArray(items) ? items : [];
}

function dashboard(req, res) {
  const desenhos = service.list({});
  const categorias = ['EIXOS', 'FLANGES', 'CHAPARIA', 'ESTRUTURAS', 'TRANSICOES'];
  const stats = {
    total: desenhos.length,
    modelos: service.listBiblioteca({}).length,
    pdfs: desenhos.reduce((acc, d) => acc + Number(d.total_pdfs || 0), 0),
    cad: desenhos.filter((d) => d.tipo_origem === 'cad').length,
  };
  const categoryCards = categorias.map((cat) => ({ nome: cat, total: desenhos.filter((d) => d.categoria === cat).length }));

  return base(res, 'desenho-tecnico/dashboard', {
    title: 'Desenho Técnico • Dashboard',
    desenhosRecentes: desenhos.slice(0, 8),
    stats,
    categoryCards,
  });
}

function index(req, res) {
  const filtros = {
    categoria: String(req.query.categoria || '').toUpperCase(),
    subtipo: String(req.query.subtipo || '').toUpperCase(),
    tipo_origem: String(req.query.tipo_origem || '').toLowerCase(),
    q: String(req.query.q || '').trim(),
  };
  return base(res, 'desenho-tecnico/index', {
    title: 'Desenho Técnico',
    lista: service.list(filtros),
    filtros,
  });
}

function novo(req, res) {
  return base(res, 'desenho-tecnico/form', {
    title: 'Novo Desenho Técnico',
    desenho: { revisao: 0, status: 'ATIVO', tipo_origem: 'parametrico' },
    equipamentos: equipamentosService.list(),
    mode: 'create',
    canManage: req.can && req.can('desenho_tecnico_manage'),
  });
}

function create(req, res) {
  const validation = validateDrawingInput(req.body);
  if (!validation.valid) {
    req.flash('error', validation.errors.join(' '));
    return res.redirect('/desenho-tecnico/novo');
  }

  const id = service.create({
    ...req.body,
    categoria: String(req.body.categoria || '').toUpperCase(),
    subtipo: String(req.body.subtipo || '').toUpperCase(),
    tipo_origem: 'parametrico',
    equipamento_id: req.body.equipamento_id || null,
    criado_por: req.session?.user?.id || null,
    props_json: JSON.stringify(validation.params),
  });

  const desenho = service.getById(id);
  service.saveSvgRevision(desenho, validation.params);

  req.flash('success', 'Desenho técnico criado com sucesso.');
  return res.redirect(`/desenho-tecnico/${id}`);
}

function novoCad(req, res) {
  const view = 'desenho-tecnico/cad-form';
  try {
    logCad('GET /desenho-tecnico/cad/novo', 'entrada na rota', { params: req.params, body: req.body });
    return base(res, view, {
      title: 'Novo Desenho CAD',
      user: req.user || req.session?.user || null,
      desenho: { revisao: 0, status: 'ATIVO', tipo_origem: 'cad' },
      equipamentos: safeEquipamentos(),
      mode: 'create',
      canManage: req.can && req.can('desenho_tecnico_manage'),
    });
  } catch (err) {
    logCadError('GET /desenho-tecnico/cad/novo', err, req, { view });
    req.flash('error', 'Não foi possível abrir o formulário de CAD.');
    return res.redirect('/desenho-tecnico');
  }
}

function createCad(req, res) {
  const route = 'POST /desenho-tecnico/cad';
  try {
    logCad(route, 'dados recebidos no POST', { params: req.params, body: req.body });
    const creation = service.createCadDrawing(req.body || {}, req.session?.user?.id || null);

    if (!creation.ok) {
      req.flash('error', creation.error || 'Não foi possível criar o desenho CAD.');
      return base(res, 'desenho-tecnico/cad-form', {
        title: 'Novo Desenho CAD',
        user: req.user || req.session?.user || null,
        desenho: { ...(req.body || {}), revisao: 0, status: 'ATIVO', tipo_origem: 'cad' },
        equipamentos: safeEquipamentos(),
        mode: 'create',
        canManage: req.can && req.can('desenho_tecnico_manage'),
      });
    }

    logCad(route, 'resultado do insert', {
      id: creation.id,
      body: req.body,
      extra: {
        tipo_origem: creation.desenho?.tipo_origem,
        modo_cad_ativo: creation.desenho?.modo_cad_ativo,
      },
    });

    req.flash('success', 'Desenho CAD criado.');
    return res.redirect(`/desenho-tecnico/cad/${creation.id}/editor`);
  } catch (err) {
    logCadError(route, err, req, { body: req.body });
    const reason = err?.message || 'erro não identificado';
    req.flash('error', `Falha ao criar desenho CAD. Detalhe: ${reason}`);
    return base(res, 'desenho-tecnico/cad-form', {
      title: 'Novo Desenho CAD',
      user: req.user || req.session?.user || null,
      desenho: { ...(req.body || {}), revisao: 0, status: 'ATIVO', tipo_origem: 'cad' },
      equipamentos: safeEquipamentos(),
      mode: 'create',
      canManage: req.can && req.can('desenho_tecnico_manage'),
    });
  }
}

function show(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho) return res.status(404).render('errors/404', { title: 'Não encontrado' });
  return base(res, 'desenho-tecnico/show', {
    title: `${desenho.codigo} • Desenho Técnico`,
    desenho,
    revisoes: service.listRevisoes(desenho.id),
    svgPreview: service.generateSvg(desenho),
    canManage: req.can && req.can('desenho_tecnico_manage'),
  });
}

function showCad(req, res) {
  const view = 'desenho-tecnico/cad-show';
  try {
    const desenho = service.getById(req.params.id);
    logCad('GET /desenho-tecnico/cad/:id', 'entrada na rota', { params: req.params, id: req.params.id });
    if (!desenho || desenho.tipo_origem !== 'cad') return res.status(404).render('errors/404', { title: 'CAD não encontrado' });
    return base(res, view, {
      title: `${desenho.codigo} • CAD`,
      user: req.user || req.session?.user || null,
      desenho,
      revisoes: service.listRevisoes(desenho.id),
      canManage: req.can && req.can('desenho_tecnico_manage'),
      svgPreview: service.generateSvg(desenho),
    });
  } catch (err) {
    logCadError('GET /desenho-tecnico/cad/:id', err, req, { view });
    req.flash('error', 'Não foi possível abrir o desenho CAD.');
    return res.redirect('/desenho-tecnico');
  }
}

function cadEditor(req, res) {
  const view = 'desenho-tecnico/cad-editor-v2';
  try {
    logCad('GET /desenho-tecnico/cad/:id/editor', 'entrada na rota', { params: req.params, id: req.params.id });
    const desenho = service.getById(req.params.id);
    if (!desenho || desenho.tipo_origem !== 'cad') return res.status(404).render('errors/404', { title: 'CAD não encontrado' });
    const cadData = desenho.cad_data || service.buildDefaultCadData({
      codigo: desenho.codigo,
      titulo: desenho.titulo,
      material: desenho.material,
      equipamento_id: desenho.equipamento_id,
      observacoes: desenho.observacoes,
    });

    const payload = cadService.sanitizeCadData({
      ...cadData,
      activeTool: cadData.activeTool || 'select',
      layers: cadData.layers || {},
      objects: Array.isArray(cadData.objects) ? cadData.objects : [],
      dimensions: Array.isArray(cadData.dimensions) ? cadData.dimensions : [],
      shafts: Array.isArray(cadData.shafts) ? cadData.shafts : [],
      history: Array.isArray(cadData.history) ? cadData.history : [],
    });
    logCad('GET /desenho-tecnico/cad/:id/editor', 'dados carregados para editor V2', {
      id: desenho.id,
      extra: { totalObjetos: payload.objects.length, hasLayers: Object.keys(payload.layers).length },
    });

    return base(res, view, {
      title: `${desenho.codigo} • Editor CAD`,
      user: req.user || req.session?.user || null,
      authFullscreen: true,
      desenho,
      layers: Array.isArray(service.CAD_LAYERS) ? service.CAD_LAYERS : [],
      cadData: payload,
      equipamentos: safeEquipamentos(),
      canManage: req.can && req.can('desenho_tecnico_manage'),
    });
  } catch (err) {
    logCadError('GET /desenho-tecnico/cad/:id/editor', err, req, { view });
    req.flash('error', 'Não foi possível abrir o editor CAD.');
    return res.redirect('/desenho-tecnico');
  }
}

function updateCadMetadata(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho || desenho.tipo_origem !== 'cad') return res.status(404).json({ ok: false, error: 'CAD não encontrado' });

  try {
    const data = service.updateCadMetadata(desenho.id, req.body || {});
    return res.json({ ok: true, data });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || String(e) });
  }
}

function saveCad(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho || desenho.tipo_origem !== 'cad') return res.status(404).json({ ok: false, error: 'CAD não encontrado' });

  try {
    const result = service.saveCad(desenho.id, req.body.cad_json || req.body, req.session?.user?.id || null);
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || String(e) });
  }
}

function renderCad3d(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho || desenho.tipo_origem !== 'cad') return res.status(404).json({ ok: false, error: 'CAD não encontrado' });

  const cadPayload = desenho.cad_data || {};
  if (!service.isCad3dCompatible(cadPayload)) {
    return res.status(422).json({ ok: false, error: 'Desenho CAD sem geometria compatível com extrusão simples.' });
  }
  return res.json({ ok: true, preview3d: service.build3dFromCad(cadPayload) });
}

function edit(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho) return res.status(404).render('errors/404', { title: 'Não encontrado' });
  return base(res, 'desenho-tecnico/form', {
    title: `Editar ${desenho.codigo}`,
    desenho,
    equipamentos: equipamentosService.list(),
    mode: 'edit',
    canManage: req.can && req.can('desenho_tecnico_manage'),
  });
}

function update(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho) return res.status(404).render('errors/404', { title: 'Não encontrado' });
  const validation = validateDrawingInput(req.body);
  if (!validation.valid) {
    req.flash('error', validation.errors.join(' '));
    return res.redirect(`/desenho-tecnico/${req.params.id}/editar`);
  }

  const payload = {
    ...desenho,
    ...req.body,
    categoria: String(req.body.categoria || '').toUpperCase(),
    subtipo: String(req.body.subtipo || '').toUpperCase(),
    equipamento_id: req.body.equipamento_id || null,
    props_json: JSON.stringify(validation.params),
  };

  service.update(desenho.id, payload);
  const atualizado = service.getById(desenho.id);
  service.saveSvgRevision(atualizado, validation.params);
  req.flash('success', 'Desenho atualizado.');
  return res.redirect(`/desenho-tecnico/${desenho.id}`);
}

function remove(req, res) {
  service.inactivate(req.params.id);
  req.flash('success', 'Desenho inativado.');
  return res.redirect('/desenho-tecnico');
}

function duplicar(req, res) {
  const newId = service.duplicate(req.params.id, req.session?.user?.id || null);
  if (!newId) {
    req.flash('error', 'Desenho não encontrado para duplicação.');
    return res.redirect('/desenho-tecnico');
  }
  req.flash('success', 'Desenho duplicado.');
  return res.redirect(`/desenho-tecnico/${newId}/editar`);
}

async function gerarPdf(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho) return res.status(404).render('errors/404', { title: 'Não encontrado' });

  try {
    const info = await service.generatePdf(desenho, desenho.props_json);
    req.flash('success', 'PDF técnico gerado.');
    return res.redirect(info.relPath);
  } catch (e) {
    req.flash('error', `Falha ao gerar PDF: ${e.message || e}`);
    return res.redirect(`/desenho-tecnico/${desenho.id}`);
  }
}

function gerarSvg(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho) return res.status(404).json({ error: 'Não encontrado' });
  const svg = service.generateSvg(desenho, desenho.props_json);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  return res.send(svg);
}

function vincularEquipamento(req, res) {
  service.vincularEquipamento(req.params.id, req.body.equipamento_id, req.body.posicao_aplicacao, req.body.observacao);
  req.flash('success', 'Desenho vinculado ao equipamento.');
  return res.redirect(`/desenho-tecnico/${req.params.id}`);
}

function biblioteca(req, res) {
  const filtros = {
    categoria: String(req.query.categoria || '').toUpperCase(),
    subtipo: String(req.query.subtipo || '').toUpperCase(),
    q: String(req.query.q || '').trim(),
  };
  return base(res, 'desenho-tecnico/biblioteca', {
    title: 'Biblioteca Técnica',
    filtros,
    itens: service.listBiblioteca(filtros),
  });
}

function revisoes(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho) return res.status(404).render('errors/404', { title: 'Não encontrado' });
  return base(res, 'desenho-tecnico/preview', {
    title: `Revisões ${desenho.codigo}`,
    desenho,
    revisoes: service.listRevisoes(desenho.id),
  });
}


function adicionarCamada(req, res) {
  try {
    service.createCamada(req.params.id, String(req.body.nome || '').trim());
    req.flash('success', 'Camada criada.');
  } catch (e) {
    req.flash('error', e.message || 'Falha ao criar camada.');
  }
  return res.redirect(`/desenho-tecnico/${req.params.id}`);
}

function atualizarCamada(req, res) {
  try {
    service.toggleCamada(req.params.id, req.params.camadaId, req.body.action);
    req.flash('success', 'Camada atualizada.');
  } catch (e) {
    req.flash('error', e.message || 'Falha ao atualizar camada.');
  }
  return res.redirect(`/desenho-tecnico/${req.params.id}`);
}

function inserirBloco(req, res) {
  try {
    service.inserirBloco(req.params.id, req.body);
    req.flash('success', 'Bloco inserido no desenho.');
  } catch (e) {
    req.flash('error', e.message || 'Falha ao inserir bloco.');
  }
  return res.redirect(`/desenho-tecnico/${req.params.id}`);
}

function adicionarCota(req, res) {
  try {
    service.salvarCota(req.params.id, req.body);
    req.flash('success', 'Cota adicionada.');
  } catch (e) {
    req.flash('error', e.message || 'Falha ao salvar cota.');
  }
  return res.redirect(`/desenho-tecnico/${req.params.id}`);
}

function duplicarBloco(req, res) {
  const id = service.duplicateBloco(req.params.blocoId);
  if (!id) req.flash('error', 'Bloco não encontrado.');
  else req.flash('success', 'Bloco duplicado.');
  return res.redirect('/desenho-tecnico/biblioteca');
}

function integrarTracagem(req, res) {
  try {
    const desenho = service.integrarTracagem(req.params.origem, req.params.id, req.session?.user?.id || null);
    service.saveSvgRevision(desenho);
    req.flash('success', 'Desenho técnico gerado a partir da Traçagem.');
    return res.redirect(`/desenho-tecnico/${desenho.id}`);
  } catch (e) {
    req.flash('error', e.message || 'Integração com Traçagem falhou.');
    return res.redirect('/tracagem/lista');
  }
}

module.exports = {
  dashboard,
  index,
  novo,
  create,
  novoCad,
  createCad,
  show,
  showCad,
  cadEditor,
  saveCad,
  renderCad3d,
  updateCadMetadata,
  edit,
  update,
  remove,
  duplicar,
  gerarPdf,
  gerarSvg,
  vincularEquipamento,
  biblioteca,
  revisoes,
  adicionarCamada,
  atualizarCamada,
  inserirBloco,
  adicionarCota,
  duplicarBloco,
  integrarTracagem,
};
