const service = require('./desenho-tecnico.service');
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

function dashboard(_req, res) {
  return res.redirect('/desenho-tecnico');
}

function index(req, res) {
  const filtros = {
    q: String(req.query.q || '').trim(),
    tipo_origem: 'cad',
  };

  const lista = service
    .list(filtros)
    .filter((item) => item.tipo_origem === 'cad')
    .map((item) => ({
      id: item.id,
      titulo: item.titulo,
      equipamento_nome: item.equipamento_nome || '-',
      atualizado_em: item.atualizado_em,
    }));

  return base(res, 'desenho-tecnico/index', {
    title: 'Desenho Técnico',
    lista,
    filtros,
  });
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

    req.flash('success', 'Desenho CAD criado.');
    return res.redirect(`/desenho-tecnico/cad/${creation.id}/editor`);
  } catch (err) {
    logCadError(route, err, req, { body: req.body });
    req.flash('error', `Falha ao criar desenho CAD. Detalhe: ${err?.message || 'erro não identificado'}`);
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

function showCad(req, res) {
  const view = 'desenho-tecnico/cad-show';
  try {
    const desenho = service.getById(req.params.id);
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


function openById(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho) return res.status(404).render('errors/404', { title: 'Não encontrado' });
  if (desenho.tipo_origem === 'cad') return res.redirect(`/desenho-tecnico/cad/${desenho.id}/editor`);
  req.flash('error', 'Este desenho não está no formato CAD.');
  return res.redirect('/desenho-tecnico');
}

async function gerarPdf(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho || desenho.tipo_origem !== 'cad') return res.status(404).render('errors/404', { title: 'CAD não encontrado' });

  try {
    const info = await service.generatePdf(desenho, desenho.props_json);
    req.flash('success', 'PDF técnico gerado.');
    return res.redirect(info.relPath);
  } catch (e) {
    req.flash('error', `Falha ao gerar PDF: ${e.message || e}`);
    return res.redirect(`/desenho-tecnico/cad/${desenho.id}`);
  }
}

module.exports = {
  dashboard,
  index,
  novoCad,
  createCad,
  showCad,
  cadEditor,
  saveCad,
  renderCad3d,
  updateCadMetadata,
  openById,
  gerarPdf,
};
