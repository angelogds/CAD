const TECH_LAYERS = ['geometria_principal', 'linhas_de_centro', 'cotas', 'textos', 'furos', 'construcao', 'observacoes'];

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeObject(obj = {}) {
  const base = {
    id: obj.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: String(obj.type || 'line'),
    layer: String(obj.layer || 'geometria_principal'),
  };

  if (base.type === 'line' || base.type === 'centerline' || base.type === 'arc') {
    return {
      ...base,
      x: toFinite(obj.x),
      y: toFinite(obj.y),
      x2: toFinite(obj.x2),
      y2: toFinite(obj.y2),
      angle: toFinite(obj.angle, null),
      radius: toFinite(obj.radius, null),
      thickness: toFinite(obj.thickness, 1),
    };
  }

  if (base.type === 'rect') {
    return {
      ...base,
      x: toFinite(obj.x),
      y: toFinite(obj.y),
      width: Math.abs(toFinite(obj.width)),
      height: Math.abs(toFinite(obj.height)),
      rotation: toFinite(obj.rotation),
      thickness: toFinite(obj.thickness, 1),
    };
  }

  if (base.type === 'circle') {
    return {
      ...base,
      x: toFinite(obj.x),
      y: toFinite(obj.y),
      radius: Math.abs(toFinite(obj.radius)),
      thickness: toFinite(obj.thickness, 1),
    };
  }

  if (base.type === 'text') {
    return {
      ...base,
      x: toFinite(obj.x),
      y: toFinite(obj.y),
      text: String(obj.text || 'Texto técnico'),
      size: toFinite(obj.size, 14),
    };
  }

  if (base.type === 'polyline') {
    return {
      ...base,
      points: Array.isArray(obj.points) ? obj.points.map((p) => ({ x: toFinite(p.x), y: toFinite(p.y) })) : [],
      closed: Boolean(obj.closed),
      thickness: toFinite(obj.thickness, 1),
    };
  }

  return { ...base, ...obj };
}

function sanitizeCadData(payload = {}) {
  const layers = { ...(payload.layers || {}) };
  for (const key of TECH_LAYERS) {
    if (!layers[key]) layers[key] = { color: '#cbd5e1', visible: true, locked: false };
  }

  return {
    codigo: String(payload.codigo || ''),
    titulo: String(payload.titulo || ''),
    material: String(payload.material || ''),
    equipamento_id: payload.equipamento_id ? Number(payload.equipamento_id) : null,
    observacoes: String(payload.observacoes || ''),
    activeTool: String(payload.activeTool || 'select'),
    activeLayer: String(payload.activeLayer || 'geometria_principal'),
    showGrid: payload.showGrid !== false,
    snapEnabled: payload.snapEnabled !== false,
    snapEndpoint: payload.snapEndpoint !== false,
    snapMidpoint: payload.snapMidpoint !== false,
    snapCenter: payload.snapCenter !== false,
    orthoEnabled: Boolean(payload.orthoEnabled),
    gridStep: Math.max(5, toFinite(payload.gridStep, 20)),
    layers,
    objects: Array.isArray(payload.objects) ? payload.objects.map(normalizeObject) : [],
    dimensions: Array.isArray(payload.dimensions) ? payload.dimensions : [],
    history: Array.isArray(payload.history) ? payload.history : [],
  };
}

module.exports = {
  TECH_LAYERS,
  sanitizeCadData,
};
