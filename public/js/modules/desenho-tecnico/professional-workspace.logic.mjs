export function viewportScreenRect(view = {}, bounds = null) {
  if (!bounds || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) return null;
  const zoom = Number(view.zoom);
  const offsetX = Number(view.offsetX);
  const offsetY = Number(view.offsetY);
  if (!Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return null;
  const x1 = bounds.minX * zoom + offsetX;
  const x2 = bounds.maxX * zoom + offsetX;
  const y1 = bounds.minY * zoom + offsetY;
  const y2 = bounds.maxY * zoom + offsetY;
  return {
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2),
  };
}

export function isUsefulViewport(view = {}, bounds = null, options = {}) {
  const rect = viewportScreenRect(view, bounds);
  if (!rect) return false;
  const width = Number(view.width);
  const height = Number(view.height);
  if (!Number.isFinite(width) || width <= 1 || !Number.isFinite(height) || height <= 1) return false;
  const margin = Number.isFinite(Number(options.margin)) ? Number(options.margin) : 72;
  const minPixelSpan = Number.isFinite(Number(options.minPixelSpan)) ? Number(options.minPixelSpan) : 28;
  const intersects = rect.maxX >= -margin && rect.minX <= width + margin && rect.maxY >= -margin && rect.minY <= height + margin;
  const span = Math.max(rect.maxX - rect.minX, rect.maxY - rect.minY);
  return intersects && span >= minPixelSpan;
}

const TYPE_LABELS = {
  line: 'Linha',
  centerline: 'Linha de centro',
  polyline: 'Polilinha',
  rect: 'Retângulo',
  circle: 'Círculo',
  arc: 'Arco',
  text: 'Texto',
  dimension: 'Cota',
  shaft: 'Eixo',
};

const TYPE_ICONS = {
  line: '╱',
  centerline: '╍',
  polyline: '⌁',
  rect: '□',
  circle: '○',
  arc: '◜',
  text: 'T',
  dimension: '↔',
  shaft: '⇥',
};

function primitiveLabel(entity = {}) {
  const primitive = String(entity.metadata?.primitive || '').toLowerCase();
  if (primitive === 'hatch') return { label: 'Hachura', icon: '▧' };
  if (primitive === 'ellipse') return { label: 'Elipse', icon: '⬭' };
  if (primitive === 'spline') return { label: 'Spline', icon: '∿' };
  if (primitive === 'flange') return { label: 'Flange', icon: '◎' };
  return null;
}

export function buildFeatureTreeModel(entities = [], layers = {}, activeLayer = '') {
  const counters = new Map();
  const groups = new Map();
  const layerNames = Object.keys(layers || {});
  for (const name of layerNames) groups.set(name, { name, active: name === activeLayer, entities: [] });

  for (const entity of entities || []) {
    const layerName = String(entity?.metadata?.layer || activeLayer || 'geometria_principal');
    if (!groups.has(layerName)) groups.set(layerName, { name: layerName, active: layerName === activeLayer, entities: [] });
    const primitive = primitiveLabel(entity);
    const type = String(entity?.type || 'objeto');
    const baseLabel = primitive?.label || TYPE_LABELS[type] || 'Objeto';
    const count = (counters.get(baseLabel) || 0) + 1;
    counters.set(baseLabel, count);
    groups.get(layerName).entities.push({
      id: String(entity?.id ?? ''),
      label: `${baseLabel} ${count}`,
      icon: primitive?.icon || TYPE_ICONS[type] || '◇',
      type,
      primitive: String(entity?.metadata?.primitive || ''),
      visible: entity?.visible !== false,
    });
  }

  return Array.from(groups.values())
    .filter((group) => group.entities.length || group.active)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'));
}
