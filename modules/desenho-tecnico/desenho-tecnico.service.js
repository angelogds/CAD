const repo = require('./desenho-tecnico.repository');
const svg = require('./desenho-tecnico.svg.service');
const pdf = require('./desenho-tecnico.pdf.service');
const integration = require('./desenho-tecnico.integration.service');
const cadService = require('./desenho-tecnico.cad.service');

const CAD_LAYERS = ['geometria_principal', 'linhas_de_centro', 'cotas', 'textos', 'furos', 'construcao', 'observacoes'];

const CAD_LAYER_COLORS = {
  geometria_principal: '#0f172a',
  linhas_de_centro: '#0284c7',
  cotas: '#166534',
  textos: '#7c3aed',
  furos: '#dc2626',
  construcao: '#64748b',
  observacoes: '#92400e',
};

const SQLITE_UNIQUE_CONSTRAINT = 'SQLITE_CONSTRAINT_UNIQUE';

function isUniqueCodigoError(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  return code === SQLITE_UNIQUE_CONSTRAINT
    || code === 'SQLITE_CONSTRAINT'
    || msg.includes('unique constraint')
    || msg.includes('desenhos_tecnicos.codigo');
}

function parseCadCodeSequence(codigo = '') {
  const match = String(codigo || '').toUpperCase().match(/^CAD(\d+)$/);
  if (!match) return null;
  return Number(match[1]);
}

function nextCadCodeFromNumber(num = 0) {
  const next = Math.max(1, num + 1);
  return `CAD${String(next).padStart(4, '0')}`;
}

function generateUniqueCadCode() {
  // Usa função que retorna o maior número CAD existente
  const maxNum = repo.getMaxCadNumber() || 0;
  let candidate = nextCadCodeFromNumber(maxNum);
  
  // Verificação extra: garante que o código não existe
  for (let i = 0; i < 100; i += 1) {
    if (!repo.getByCodigo(candidate)) {
      return candidate;
    }
    // Se já existe, incrementa
    const currentNum = parseCadCodeSequence(candidate) || maxNum + i;
    candidate = nextCadCodeFromNumber(currentNum);
  }
  
  // Fallback: usa timestamp
  return `CAD${Date.now()}`;
}

function parseParams(raw = {}) {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (_e) { return {}; }
  }
  return raw || {};
}

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function slugifyLayer(name = '') {
  return String(name).toLowerCase().trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function list(filters) { return repo.list(filters); }
function getById(id) {
  const desenho = repo.getById(id);
  if (!desenho) return null;
  return {
    ...desenho,
    cad_data: parseJson(desenho.json_cad, null),
    preview3d: parseJson(desenho.json_3d, null),
  };
}

function create(payload) {
  return repo.create({
    ...payload,
    descricao: payload.descricao || null,
    material: payload.material || null,
    observacoes: payload.observacoes || null,
    historico_revisao: payload.historico_revisao || 'Criação inicial',
    status: payload.status || 'ATIVO',
    revisao: Number(payload.revisao || 0),
    origem_modulo: payload.origem_modulo || null,
    origem_referencia: payload.origem_referencia || null,
    origem_integracao_em: payload.origem_integracao_em || null,
    tipo_origem: payload.tipo_origem || 'parametrico',
    modo_cad_ativo: Number(payload.modo_cad_ativo || 0),
    json_cad: payload.json_cad || null,
    json_3d: payload.json_3d || null,
  });
}

function update(id, payload) {
  return repo.update(id, {
    ...payload,
    revisao: Number(payload.revisao || 0),
    status: payload.status || 'ATIVO',
    tipo_origem: payload.tipo_origem || 'parametrico',
    modo_cad_ativo: Number(payload.modo_cad_ativo || 0),
  });
}

function saveCad(desenhoId, cadData, userId) {
  const payloadRaw = typeof cadData === 'string' ? JSON.parse(cadData) : cadData;
  const payload = cadService.sanitizeCadData(payloadRaw || {});
  const objetos = Array.isArray(payload.objects) ? payload.objects : [];

  for (const obj of objetos) {
    if (obj.radius != null && Number(obj.radius) <= 0) throw new Error('Raio inválido.');
    if (obj.thickness != null && Number(obj.thickness) < 0) throw new Error('Espessura negativa não permitida.');
    if (obj.type === 'text' && (!Number.isFinite(Number(obj.x)) || !Number.isFinite(Number(obj.y)))) throw new Error('Texto sem posição válida.');
  }

  const compatible3d = isCad3dCompatible(payload);
  const preview3d = compatible3d ? build3dFromCad(payload) : null;

  repo.updateCadData(desenhoId, {
    json_cad: JSON.stringify(payload),
    json_3d: preview3d ? JSON.stringify(preview3d) : null,
  });
  repo.replaceCadObjects(desenhoId, objetos);
  repo.insertCadHistory(desenhoId, 'save', JSON.stringify({ totalObjetos: objetos.length, compatible3d }), userId);
  return { compatible3d, preview3d };
}


function createCadDrawing(payload = {}, userId = null) {
  const normalized = normalizeCadMetadata(payload || {});
  const validation = validateCadMetadata(normalized);
  if (!validation.valid) {
    return { ok: false, id: null, desenho: null, error: validation.errors.join(' ') };
  }

  // Se código foi informado pelo usuário, usa ele; senão gera automático
  const codigoInformado = Boolean(validation.data.codigo);
  let codigo = codigoInformado ? validation.data.codigo : generateUniqueCadCode();

  const maxAttempts = codigoInformado ? 1 : 10;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const data = { ...validation.data, codigo };
      const cadData = buildDefaultCadData(data);
      
      const id = create({
        ...data,
        categoria: 'CAD',
        subtipo: 'DESENHO_MANUAL_2D',
        tipo_origem: 'cad',
        modo_cad_ativo: 1,
        json_cad: JSON.stringify(cadData),
        criado_por: userId || null,
        status: 'ATIVO',
        revisao: 0,
      });
      
      const desenho = getById(id);
      if (!desenho) {
        throw new Error(`Desenho CAD criado com id ${id}, mas não foi encontrado em seguida.`);
      }
      
      console.log('[CAD] Desenho criado com sucesso:', { id, codigo });
      return { ok: true, id, desenho, error: null };
      
    } catch (error) {
      console.error('[CAD] Erro ao criar desenho:', { 
        attempt, 
        codigo, 
        message: error?.message,
        code: error?.code 
      });
      
      if (isUniqueCodigoError(error)) {
        if (codigoInformado) {
          // Usuário informou código duplicado
          return { 
            ok: false, 
            id: null, 
            desenho: null, 
            error: `O código "${codigo}" já existe. Informe outro código ou deixe em branco para gerar automaticamente.` 
          };
        }
        // Código automático colidiu, tenta próximo
        const currentNum = parseCadCodeSequence(codigo) || 0;
        codigo = nextCadCodeFromNumber(currentNum);
        continue;
      }
      
      // Outro tipo de erro
      return { 
        ok: false, 
        id: null, 
        desenho: null, 
        error: `Erro ao criar desenho: ${error?.message || String(error)}` 
      };
    }
  }

  return { 
    ok: false, 
    id: null, 
    desenho: null, 
    error: 'Não foi possível criar o desenho CAD após várias tentativas. Por favor, tente novamente.' 
  };
}

function normalizeCadMetadata(payload = {}) {
  return {
    codigo: String(payload.codigo || '').trim(),
    titulo: String(payload.titulo || '').trim(),
    material: String(payload.material || '').trim() || null,
    equipamento_id: payload.equipamento_id ? Number(payload.equipamento_id) : null,
    observacoes: String(payload.observacoes || '').trim() || null,
  };
}

function validateCadMetadata(payload = {}, options = {}) {
  const data = normalizeCadMetadata(payload);
  const errors = [];
  if (!data.titulo) errors.push('Título é obrigatório.');

  if (data.codigo) {
    const duplicate = options.excludeId
      ? repo.getByCodigoExcludingId(data.codigo, options.excludeId)
      : repo.getByCodigo(data.codigo);
    if (duplicate) errors.push('Código já existe. Informe outro código ou deixe em branco para gerar automático.');
  }

  return { valid: errors.length === 0, errors, data };
}

function buildDefaultCadData(meta = {}) {
  const layers = CAD_LAYERS.reduce((acc, layer) => {
    acc[layer] = { color: CAD_LAYER_COLORS[layer] || '#0f172a', visible: true, locked: false };
    return acc;
  }, {});
  return {
    codigo: meta.codigo || '',
    titulo: meta.titulo || '',
    material: meta.material || '',
    equipamento_id: meta.equipamento_id || null,
    observacoes: meta.observacoes || '',
    gridStep: 20,
    snapEnabled: true,
    showGrid: true,
    activeLayer: 'geometria_principal',
    layers,
    objects: [],
    dimensions: [],
    history: [],
  };
}

function updateCadMetadata(desenhoId, payload = {}) {
  const validation = validateCadMetadata(payload, { excludeId: desenhoId });
  if (!validation.valid) throw new Error(validation.errors.join(' '));

  const data = { ...validation.data };
  if (!data.codigo) data.codigo = generateUniqueCadCode();
  repo.updateCadMetadata(desenhoId, data);
  return data;
}

function isCad3dCompatible(payload = {}) {
  const objects = Array.isArray(payload.objects) ? payload.objects : [];
  const closedShapes = objects.filter((o) => ['rect', 'circle', 'polyline'].includes(o.type));
  return closedShapes.length > 0;
}

function build3dFromCad(payload = {}) {
  const objects = Array.isArray(payload.objects) ? payload.objects : [];
  const extrudables = objects
    .filter((o) => ['rect', 'circle', 'polyline'].includes(o.type))
    .map((o) => ({
      type: o.type,
      x: Number(o.x || 0),
      y: Number(o.y || 0),
      width: Number(o.width || 0),
      height: Number(o.height || 0),
      radius: Number(o.radius || 0),
      points: o.points || [],
      thickness: Number(o.thickness || payload.defaultThickness || 10),
      layer: o.layer || 'geometria_principal',
    }));

  return {
    mode: 'simple-extrusion',
    generatedAt: new Date().toISOString(),
    items: extrudables,
  };
}

function inactivate(id) { return repo.inactivate(id); }

function duplicate(id, userId) {
  const code = `DT-${Date.now()}`;
  return repo.duplicate(id, code, userId);
}

function contextForRender(desenho, params) {
  return {
    ...desenho,
    params: parseParams(params || desenho.props_json || {}),
    camadas: repo.listCamadas(desenho.id),
    cotas: repo.listCotas(desenho.id),
    blocos: repo.listBlocoInstancias(desenho.id),
  };
}

function generateSvg(desenho, params) {
  return svg.renderTechnicalDrawing(contextForRender(desenho, params));
}

async function generatePdf(desenho, params) {
  const svgMarkup = generateSvg(desenho, params);
  const cadData = parseJson(desenho.json_cad, null);
  const pdfInfo = await pdf.generateTechnicalPdf(desenho, svgMarkup, {
    tipoOrigem: desenho.tipo_origem || 'parametrico',
    preview3d: parseJson(desenho.json_3d, null),
    cadData: cadData
  });
  repo.saveArquivo(desenho.id, {
    tipo_arquivo: 'PDF',
    arquivo_pdf: pdfInfo.relPath,
    svg_source: svgMarkup,
    preview_path: null,
    revisao: desenho.revisao,
  });
  return { ...pdfInfo, svgMarkup };
}

function saveSvgRevision(desenho, params) {
  const svgMarkup = generateSvg(desenho, params);
  repo.saveArquivo(desenho.id, {
    tipo_arquivo: 'SVG',
    svg_source: svgMarkup,
    arquivo_pdf: null,
    preview_path: null,
    revisao: desenho.revisao,
  });
  return svgMarkup;
}

function listRevisoes(id) { return repo.listRevisoes(id); }
function listBiblioteca(filters) { return repo.listBiblioteca(filters); }
function vincularEquipamento(desenhoId, equipamentoId, posicaoAplicacao, observacao) { return repo.vincularEquipamento(desenhoId, equipamentoId, posicaoAplicacao, observacao); }
function listByEquipamento(equipamentoId) { return repo.listAplicacoesByEquipamento(equipamentoId); }
function getByOrigem(modulo, referencia) { return repo.getByOrigem(modulo, referencia); }
function listCamadas(desenhoId) { return repo.listCamadas(desenhoId); }

function createCamada(desenhoId, nome) {
  const slug = slugifyLayer(nome);
  const duplicate = repo.listCamadas(desenhoId).find((layer) => layer.slug === slug);
  if (duplicate) throw new Error('Nome de camada duplicado no mesmo desenho.');
  return repo.createCamada(desenhoId, {
    nome,
    slug,
    cor_ref: '#334155',
    tipo_linha: 'solida',
    espessura_ref: 1,
    ordem: 100,
  });
}

function toggleCamada(desenhoId, camadaId, action) {
  const camada = repo.listCamadas(desenhoId).find((item) => Number(item.id) === Number(camadaId));
  if (!camada) throw new Error('Camada não encontrada.');
  repo.updateCamada(camada.id, {
    nome: camada.nome,
    ordem: camada.ordem,
    visivel: action === 'toggle-visible' ? (camada.visivel ? 0 : 1) : camada.visivel,
    bloqueado: action === 'toggle-lock' ? (camada.bloqueado ? 0 : 1) : camada.bloqueado,
  });
}

function salvarCota(desenhoId, payload = {}) {
  const escala = Number(payload.escala || 1);
  const rotacao = Number(payload.rotacao || 0);
  if (!Number.isFinite(escala) || escala <= 0) throw new Error('Escala inválida.');
  if (!Number.isFinite(rotacao)) throw new Error('Rotação inválida.');
  if (!payload.tipo_cota) throw new Error('Cota inválida.');
  return repo.saveCota(desenhoId, {
    ...payload,
    estilo_json: payload.estilo_json ? JSON.stringify(payload.estilo_json) : null,
  });
}

function inserirBloco(desenhoId, payload = {}) {
  const bloco = repo.getBlocoById(payload.bloco_id);
  if (!bloco || !bloco.ativo) throw new Error('Bloco inexistente ou inativo.');
  const escala = Number(payload.escala || 1);
  const rotacao = Number(payload.rotacao || 0);
  if (!Number.isFinite(escala) || escala <= 0) throw new Error('Escala inválida.');
  if (!Number.isFinite(rotacao)) throw new Error('Rotação inválida.');
  if (!Number.isFinite(Number(payload.x)) || !Number.isFinite(Number(payload.y))) throw new Error('Instância de bloco inválida.');
  return repo.createBlocoInstancia(desenhoId, {
    bloco_id: Number(payload.bloco_id),
    nome_instancia: payload.nome_instancia || bloco.nome,
    x: Number(payload.x),
    y: Number(payload.y),
    escala,
    rotacao,
    camada: payload.camada || 'geometria_principal',
    props_override_json: payload.props_override_json ? JSON.stringify(payload.props_override_json) : null,
  });
}

function listInstancias(desenhoId) { return repo.listBlocoInstancias(desenhoId); }
function listCotas(desenhoId) { return repo.listCotas(desenhoId); }
function duplicateBloco(id) { return repo.duplicateBloco(id); }

function integrarTracagem(origem, id, userId) {
  const tracagem = integration.loadTracagem(origem, id);
  const payload = integration.mapTracagemToDesenho(tracagem);
  const desenhoId = create({ ...payload, criado_por: userId || null, status: 'RASCUNHO' });
  return getById(desenhoId);
}

module.exports = {
  CAD_LAYERS,
  list,
  getById,
  create,
  update,
  saveCad,
  isCad3dCompatible,
  build3dFromCad,
  inactivate,
  duplicate,
  generateSvg,
  saveSvgRevision,
  generatePdf,
  listRevisoes,
  listBiblioteca,
  vincularEquipamento,
  listByEquipamento,
  getByOrigem,
  listCamadas,
  createCamada,
  toggleCamada,
  inserirBloco,
  listInstancias,
  salvarCota,
  listCotas,
  duplicateBloco,
  integrarTracagem,
  validateCadMetadata,
  buildDefaultCadData,
  updateCadMetadata,
  createCadDrawing,
};
