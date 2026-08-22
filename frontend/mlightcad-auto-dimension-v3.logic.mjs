const EPS = 1e-6;

export const TECHNICAL_LAYERS = Object.freeze({
  OUTLINE: 'FAB_CONTORNO',
  DIMENSIONS: 'FAB_COTAS',
  CENTER: 'FAB_EIXOS_CENTRO',
  NOTES: 'FAB_NOTAS_TECNICAS',
  HATCH: 'FAB_HACHURA',
  CONSTRUCTION: 'FAB_CONSTRUCAO',
  SHEET: 'FAB_FOLHA_TECNICA',
  KEYWAY: 'FAB_RASGOS_CHAVETA'
});

export const TECHNICAL_LAYER_NAMES = Object.freeze(Object.values(TECHNICAL_LAYERS));
export const AUTO_DIM_V3_MAX = 36;

const NON_MODEL_LAYERS = new Set([
  TECHNICAL_LAYERS.DIMENSIONS,
  TECHNICAL_LAYERS.CENTER,
  TECHNICAL_LAYERS.NOTES,
  TECHNICAL_LAYERS.HATCH,
  TECHNICAL_LAYERS.CONSTRUCTION,
  TECHNICAL_LAYERS.SHEET
]);

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(asNumber(b?.x) - asNumber(a?.x), asNumber(b?.y) - asNumber(a?.y));

function fmt(value) {
  const number = asNumber(value);
  if (Math.abs(number - Math.round(number)) < 0.005) return String(Math.round(number));
  return number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function isNonModelLayer(layerName) {
  return NON_MODEL_LAYERS.has(String(layerName || '').trim().toUpperCase());
}

function pushBoundsPoint(points, x, y) {
  if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) points.push({ x: Number(x), y: Number(y) });
}

export function computeSnapshotBounds(snapshot = {}) {
  const points = [];
  for (const line of snapshot.lines || []) {
    pushBoundsPoint(points, line.x1, line.y1);
    pushBoundsPoint(points, line.x2, line.y2);
  }
  for (const circle of snapshot.circles || []) {
    const radius = Math.abs(asNumber(circle.radius));
    pushBoundsPoint(points, asNumber(circle.cx) - radius, asNumber(circle.cy) - radius);
    pushBoundsPoint(points, asNumber(circle.cx) + radius, asNumber(circle.cy) + radius);
  }
  for (const polyline of snapshot.polylines || []) {
    for (const point of polyline.points || []) pushBoundsPoint(points, point.x, point.y);
  }
  for (const ellipse of snapshot.ellipses || []) {
    const major = Math.abs(asNumber(ellipse.majorRadius));
    const minor = Math.abs(asNumber(ellipse.minorRadius));
    const rotation = asNumber(ellipse.rotation);
    const ex = Math.sqrt((major * Math.cos(rotation)) ** 2 + (minor * Math.sin(rotation)) ** 2);
    const ey = Math.sqrt((major * Math.sin(rotation)) ** 2 + (minor * Math.cos(rotation)) ** 2);
    pushBoundsPoint(points, asNumber(ellipse.cx) - ex, asNumber(ellipse.cy) - ey);
    pushBoundsPoint(points, asNumber(ellipse.cx) + ex, asNumber(ellipse.cy) + ey);
  }
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function polylineBounds(polyline) {
  const points = (polyline?.points || []).filter((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
  if (!points.length) return null;
  const xs = points.map((point) => Number(point.x));
  const ys = points.map((point) => Number(point.y));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function axisAlignedRectangle(polyline, tolerance) {
  if (!polyline?.closed || (polyline.points || []).length !== 4) return null;
  const bounds = polylineBounds(polyline);
  if (!bounds || bounds.width <= tolerance || bounds.height <= tolerance) return null;
  const valid = polyline.points.every((point) => {
    const onX = Math.abs(point.x - bounds.minX) <= tolerance || Math.abs(point.x - bounds.maxX) <= tolerance;
    const onY = Math.abs(point.y - bounds.minY) <= tolerance || Math.abs(point.y - bounds.maxY) <= tolerance;
    return onX && onY;
  });
  return valid ? { ...bounds, id: polyline.id } : null;
}

export function detectShaftChain(snapshot = {}, tolerance = 0.05) {
  const rectangles = (snapshot.polylines || [])
    .map((polyline) => ({ polyline, rect: axisAlignedRectangle(polyline, tolerance) }))
    .filter((item) => item.rect)
    .map((item) => ({ ...item.rect, polyline: item.polyline }))
    .sort((a, b) => a.minX - b.minX);
  if (rectangles.length < 2) return null;

  const medianCenterY = rectangles.reduce((sum, rect) => sum + rect.centerY, 0) / rectangles.length;
  const aligned = rectangles.filter((rect) => Math.abs(rect.centerY - medianCenterY) <= Math.max(tolerance * 4, rect.height * 0.02));
  if (aligned.length < 2) return null;

  for (let index = 1; index < aligned.length; index += 1) {
    const previous = aligned[index - 1];
    const current = aligned[index];
    if (Math.abs(current.minX - previous.maxX) > Math.max(tolerance * 4, 0.5)) return null;
  }
  return aligned;
}

export function groupCirclesByDiameter(circles = [], tolerance = 0.05) {
  const groups = [];
  for (const circle of circles) {
    const radius = Math.abs(asNumber(circle.radius));
    if (radius <= tolerance) continue;
    let group = groups.find((candidate) => Math.abs(candidate.radius - radius) <= tolerance);
    if (!group) {
      group = { radius, circles: [] };
      groups.push(group);
    }
    group.circles.push(circle);
  }
  return groups.sort((a, b) => b.radius - a.radius);
}

export function detectBoltCircle(circles = [], tolerance = 0.05) {
  if (circles.length < 3) return null;
  const center = circles.reduce((acc, circle) => ({
    x: acc.x + asNumber(circle.cx) / circles.length,
    y: acc.y + asNumber(circle.cy) / circles.length
  }), { x: 0, y: 0 });
  const radii = circles.map((circle) => Math.hypot(asNumber(circle.cx) - center.x, asNumber(circle.cy) - center.y));
  const average = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  const holeRadius = Math.abs(asNumber(circles[0]?.radius));
  if (!(average > holeRadius * 1.25)) return null;
  const maxDeviation = Math.max(...radii.map((radius) => Math.abs(radius - average)));
  if (maxDeviation > Math.max(tolerance * 3, average * 0.015)) return null;
  return { center, radius: average, count: circles.length };
}

function createLaneAllocator(bounds, step) {
  const counters = { top: 0, bottom: 0, right: 0, left: 0 };
  return {
    top() {
      counters.top += 1;
      return bounds.maxY + step * counters.top;
    },
    bottom() {
      counters.bottom += 1;
      return bounds.minY - step * counters.bottom;
    },
    right() {
      counters.right += 1;
      return bounds.maxX + step * counters.right;
    },
    left() {
      counters.left += 1;
      return bounds.minX - step * counters.left;
    },
    counters
  };
}

function planKey(item) {
  if (item.key) return item.key;
  return [item.semantic, item.label, fmt(item.p1?.x), fmt(item.p1?.y), fmt(item.p2?.x), fmt(item.p2?.y)].join('|');
}

export function planAutoDimensions(snapshot = {}, options = {}) {
  const bounds = computeSnapshotBounds(snapshot);
  if (!bounds) return { bounds: null, dimensions: [], summary: { total: 0 } };

  const maxDimensions = Math.max(1, Math.min(100, Number(options.maxDimensions) || AUTO_DIM_V3_MAX));
  const span = Math.max(bounds.width, bounds.height, 1);
  const tolerance = Math.max(0.01, span * 0.0001);
  const step = clamp(span * 0.055, 8, 35);
  const lanes = createLaneAllocator(bounds, step);
  const dimensions = [];
  const keys = new Set();
  const push = (item) => {
    if (dimensions.length >= maxDimensions) return false;
    const key = planKey(item);
    if (keys.has(key)) return false;
    keys.add(key);
    dimensions.push({ ...item, key });
    return true;
  };

  const shaft = detectShaftChain(snapshot, tolerance);
  const shaftIds = new Set((shaft || []).map((rect) => rect.polyline?.id));
  if (shaft?.length) {
    const chainY = lanes.bottom();
    for (const rect of shaft) {
      push({
        semantic: 'shaft-length',
        label: fmt(rect.width),
        p1: { x: rect.minX, y: rect.minY },
        p2: { x: rect.maxX, y: rect.minY },
        dimLinePoint: { x: rect.centerX, y: chainY },
        sourceId: rect.polyline?.id
      });
      const side = rect.centerX <= bounds.centerX ? -1 : 1;
      push({
        semantic: 'shaft-diameter',
        label: `Ø${fmt(rect.height)}`,
        p1: { x: rect.centerX, y: rect.minY },
        p2: { x: rect.centerX, y: rect.maxY },
        dimLinePoint: { x: side < 0 ? rect.minX - step * 0.55 : rect.maxX + step * 0.55, y: rect.centerY },
        sourceId: rect.polyline?.id
      });
    }
    const minX = Math.min(...shaft.map((rect) => rect.minX));
    const maxX = Math.max(...shaft.map((rect) => rect.maxX));
    push({
      semantic: 'shaft-total',
      label: `TOTAL ${fmt(maxX - minX)}`,
      p1: { x: minX, y: bounds.minY },
      p2: { x: maxX, y: bounds.minY },
      dimLinePoint: { x: (minX + maxX) / 2, y: lanes.bottom() }
    });
  }

  for (const group of groupCirclesByDiameter(snapshot.circles || [], tolerance)) {
    if (dimensions.length >= maxDimensions) break;
    const first = group.circles[0];
    const bolt = detectBoltCircle(group.circles, tolerance);
    if (bolt) {
      push({
        semantic: 'bolt-hole-diameter',
        label: `${group.circles.length}x Ø${fmt(group.radius * 2)}`,
        p1: { x: asNumber(first.cx) - group.radius, y: asNumber(first.cy) },
        p2: { x: asNumber(first.cx) + group.radius, y: asNumber(first.cy) },
        dimLinePoint: { x: asNumber(first.cx), y: lanes.top() }
      });
      push({
        semantic: 'bolt-circle-pcd',
        label: `PCD Ø${fmt(bolt.radius * 2)}`,
        p1: { x: bolt.center.x - bolt.radius, y: bolt.center.y },
        p2: { x: bolt.center.x + bolt.radius, y: bolt.center.y },
        dimLinePoint: { x: bolt.center.x, y: lanes.top() }
      });
      continue;
    }
    push({
      semantic: 'circle-diameter',
      label: `${group.circles.length > 1 ? `${group.circles.length}x ` : ''}Ø${fmt(group.radius * 2)}`,
      p1: { x: asNumber(first.cx) - group.radius, y: asNumber(first.cy) },
      p2: { x: asNumber(first.cx) + group.radius, y: asNumber(first.cy) },
      dimLinePoint: { x: asNumber(first.cx), y: lanes.top() }
    });
  }

  const genericPolylines = (snapshot.polylines || [])
    .filter((polyline) => !shaftIds.has(polyline.id))
    .map((polyline) => ({ polyline, bounds: polylineBounds(polyline) }))
    .filter((item) => item.bounds && item.polyline.closed)
    .sort((a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height))
    .slice(0, 6);

  for (const { polyline, bounds: box } of genericPolylines) {
    if (box.width > tolerance) {
      push({
        semantic: 'profile-width',
        label: fmt(box.width),
        p1: { x: box.minX, y: box.minY },
        p2: { x: box.maxX, y: box.minY },
        dimLinePoint: { x: box.centerX, y: lanes.bottom() },
        sourceId: polyline.id
      });
    }
    if (box.height > tolerance) {
      push({
        semantic: 'profile-height',
        label: fmt(box.height),
        p1: { x: box.maxX, y: box.minY },
        p2: { x: box.maxX, y: box.maxY },
        dimLinePoint: { x: lanes.right(), y: box.centerY },
        sourceId: polyline.id
      });
    }
  }

  if (!shaft?.length && genericPolylines.length === 0) {
    const axisLines = (snapshot.lines || [])
      .map((line) => {
        const dx = asNumber(line.x2) - asNumber(line.x1);
        const dy = asNumber(line.y2) - asNumber(line.y1);
        return { line, dx, dy, length: Math.hypot(dx, dy) };
      })
      .filter((item) => item.length > tolerance && (Math.abs(item.dx) <= tolerance || Math.abs(item.dy) <= tolerance))
      .sort((a, b) => b.length - a.length)
      .slice(0, 8);
    const lineLengths = new Set();
    for (const item of axisLines) {
      const horizontal = Math.abs(item.dy) <= tolerance;
      const dedupe = `${horizontal ? 'H' : 'V'}:${fmt(item.length)}`;
      if (lineLengths.has(dedupe)) continue;
      lineLengths.add(dedupe);
      push({
        semantic: horizontal ? 'line-horizontal' : 'line-vertical',
        label: fmt(item.length),
        p1: { x: item.line.x1, y: item.line.y1 },
        p2: { x: item.line.x2, y: item.line.y2 },
        dimLinePoint: horizontal
          ? { x: (asNumber(item.line.x1) + asNumber(item.line.x2)) / 2, y: lanes.bottom() }
          : { x: lanes.right(), y: (asNumber(item.line.y1) + asNumber(item.line.y2)) / 2 },
        sourceId: item.line.id
      });
    }
  }

  for (const ellipse of (snapshot.ellipses || []).slice(0, 2)) {
    const major = Math.abs(asNumber(ellipse.majorRadius));
    const minor = Math.abs(asNumber(ellipse.minorRadius));
    if (major <= tolerance || minor <= tolerance) continue;
    const angle = asNumber(ellipse.rotation);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const vx = -uy;
    const vy = ux;
    const cx = asNumber(ellipse.cx);
    const cy = asNumber(ellipse.cy);
    push({
      semantic: 'ellipse-major',
      label: `EIXO MAIOR ${fmt(major * 2)}`,
      p1: { x: cx - ux * major, y: cy - uy * major },
      p2: { x: cx + ux * major, y: cy + uy * major },
      dimLinePoint: { x: cx + vx * (minor + step), y: cy + vy * (minor + step) },
      sourceId: ellipse.id
    });
    push({
      semantic: 'ellipse-minor',
      label: `EIXO MENOR ${fmt(minor * 2)}`,
      p1: { x: cx - vx * minor, y: cy - vy * minor },
      p2: { x: cx + vx * minor, y: cy + vy * minor },
      dimLinePoint: { x: cx + ux * (major + step), y: cy + uy * (major + step) },
      sourceId: ellipse.id
    });
  }

  const summary = dimensions.reduce((acc, item) => {
    acc[item.semantic] = (acc[item.semantic] || 0) + 1;
    acc.total += 1;
    return acc;
  }, { total: 0 });

  return { bounds, step, tolerance, dimensions, summary, laneUsage: lanes.counters };
}
