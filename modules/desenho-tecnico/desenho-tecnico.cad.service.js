const TECH_LAYERS = ['geometria_principal', 'linhas_de_centro', 'cotas', 'textos', 'furos', 'construcao', 'observacoes'];

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizePoint(point = {}) {
  return { x: toFinite(point.x), y: toFinite(point.y) };
}

function normalizeObject(obj = {}) {
  const base = {
    id: obj.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: String(obj.type || 'line'),
    layer: String(obj.layer || 'geometria_principal'),
    style: { ...plainObject(obj.style) },
    metadata: { ...plainObject(obj.metadata), layer: String(obj.layer || obj.metadata?.layer || 'geometria_principal') },
    visible: obj.visible !== false,
  };

  if (base.type === 'line' || base.type === 'centerline') {
    return {
      ...base,
      x: toFinite(obj.x),
      y: toFinite(obj.y),
      x2: toFinite(obj.x2),
      y2: toFinite(obj.y2),
      thickness: toFinite(obj.thickness, 1),
    };
  }

  if (base.type === 'arc') {
    const geometry = plainObject(obj.geometry);
    return {
      ...base,
      geometry: {
        cx: toFinite(geometry.cx, toFinite(obj.cx, toFinite(obj.x))),
        cy: toFinite(geometry.cy, toFinite(obj.cy, toFinite(obj.y))),
        radius: Math.abs(toFinite(geometry.radius, toFinite(obj.radius))),
        startAngle: toFinite(geometry.startAngle, toFinite(obj.startAngle)),
        endAngle: toFinite(geometry.endAngle, toFinite(obj.endAngle)),
        ccw: geometry.ccw !== false && obj.ccw !== false,
      },
      thickness: toFinite(obj.thickness, 1),
    };
  }

  if (base.type === 'rect') {
    const rawX = toFinite(obj.x);
    const rawY = toFinite(obj.y);
    const rawWidth = toFinite(obj.width);
    const rawHeight = toFinite(obj.height);
    return {
      ...base,
      x: Math.min(rawX, rawX + rawWidth),
      y: Math.min(rawY, rawY + rawHeight),
      width: Math.abs(rawWidth),
      height: Math.abs(rawHeight),
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

  if (base.type === 'dimension') {
    const geometry = plainObject(obj.geometry);
    const normalized = { ...geometry };
    ['p1', 'p2', 'textPoint', 'vertex'].forEach((key) => {
      if (geometry[key]) normalized[key] = normalizePoint(geometry[key]);
    });
    ['radius', 'startAngle', 'endAngle'].forEach((key) => {
      if (geometry[key] != null) normalized[key] = toFinite(geometry[key]);
    });
    if (geometry.label != null) normalized.label = String(geometry.label);
    if (Array.isArray(geometry.sourceIds)) normalized.sourceIds = geometry.sourceIds.map(String);
    return { ...base, geometry: normalized };
  }

  if (base.type === 'shaft') {
    const geometry = plainObject(obj.geometry);
    return {
      ...base,
      geometry: {
        origin: normalizePoint(geometry.origin),
        orientation: geometry.orientation === 'vertical' ? 'vertical' : 'horizontal',
        segments: Array.isArray(geometry.segments)
          ? geometry.segments.map((segment) => ({
            length: Math.abs(toFinite(segment.length)),
            diameter: Math.abs(toFinite(segment.diameter)),
          })).filter((segment) => segment.length > 0 && segment.diameter > 0)
          : [],
      },
    };
  }

  return { ...base, geometry: { ...plainObject(obj.geometry) } };
}

function sanitizeCadData(payload = {}) {
  const layers = { ...(payload.layers || {}) };
  for (const key of TECH_LAYERS) {
    if (!layers[key]) layers[key] = { color: '#cbd5e1', visible: true, locked: false };
  }

  const normalizedObjects = (Array.isArray(payload.objects) ? payload.objects : []).map(normalizeObject);
  const dimensionMap = new Map();
  normalizedObjects.filter((object) => object.type === 'dimension').forEach((dimension) => dimensionMap.set(String(dimension.id), dimension));
  (Array.isArray(payload.dimensions) ? payload.dimensions : []).forEach((dimension) => {
    const normalized = normalizeObject({ ...dimension, type: 'dimension', layer: dimension.layer || 'cotas' });
    dimensionMap.set(String(normalized.id), normalized);
  });

  const snapInput = plainObject(payload.snappingConfig);
  const snapEnabled = snapInput.enabled !== false && payload.snapEnabled !== false;
  const snappingConfig = {
    enabled: snapEnabled,
    grid: snapInput.grid !== false,
    endpoint: snapInput.endpoint !== false && payload.snapEndpoint !== false,
    midpoint: snapInput.midpoint !== false && payload.snapMidpoint !== false,
    intersection: snapInput.intersection !== false,
    center: snapInput.center !== false && payload.snapCenter !== false,
    quadrant: snapInput.quadrant !== false,
    nearest: snapInput.nearest !== false,
  };

  const viewportInput = plainObject(payload.viewport);
  const viewport = Object.keys(viewportInput).length ? {
    zoom: Math.max(0.0001, Math.min(10000, toFinite(viewportInput.zoom, 1))),
    offsetX: toFinite(viewportInput.offsetX),
    offsetY: toFinite(viewportInput.offsetY),
  } : null;

  return {
    schemaVersion: Math.max(2, Math.trunc(toFinite(payload.schemaVersion, 2))),
    codigo: String(payload.codigo || ''),
    titulo: String(payload.titulo || ''),
    material: String(payload.material || ''),
    equipamento_id: payload.equipamento_id ? Number(payload.equipamento_id) : null,
    observacoes: String(payload.observacoes || ''),
    activeTool: String(payload.activeTool || 'select'),
    activeLayer: String(payload.activeLayer || 'geometria_principal'),
    showGrid: payload.showGrid !== false,
    unidade: String(payload.unidade || 'mm'),
    snapEnabled,
    snapEndpoint: snappingConfig.endpoint,
    snapMidpoint: snappingConfig.midpoint,
    snapCenter: snappingConfig.center,
    snappingConfig,
    orthoEnabled: Boolean(payload.orthoEnabled),
    gridStep: Math.max(0.001, Math.min(1000000, toFinite(payload.gridStep, 20))),
    layers,
    objects: normalizedObjects.filter((object) => object.type !== 'dimension'),
    dimensions: Array.from(dimensionMap.values()),
    viewport,
    history: Array.isArray(payload.history) ? payload.history.slice(-100) : [],
  };
}

module.exports = {
  TECH_LAYERS,
  sanitizeCadData,
};
