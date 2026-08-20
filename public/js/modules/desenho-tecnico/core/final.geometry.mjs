const TAU = Math.PI * 2;
const EPS = 1e-8;

export function rotatePoint(point, center, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}

export function ellipsePoints(center, rx, ry, rotation = 0, segments = 96) {
  const count = Math.max(24, Math.floor(segments));
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * TAU;
    const local = { x: center.x + Math.cos(a) * Math.abs(rx), y: center.y + Math.sin(a) * Math.abs(ry) };
    points.push(rotation ? rotatePoint(local, center, rotation) : local);
  }
  return points;
}

function catmullPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function splinePoints(controlPoints = [], subdivisions = 18) {
  if (controlPoints.length < 2) return [...controlPoints];
  if (controlPoints.length === 2) return [...controlPoints];
  const points = [];
  const steps = Math.max(6, Math.floor(subdivisions));
  for (let i = 0; i < controlPoints.length - 1; i += 1) {
    const p0 = controlPoints[Math.max(0, i - 1)];
    const p1 = controlPoints[i];
    const p2 = controlPoints[i + 1];
    const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)];
    for (let j = 0; j < steps; j += 1) points.push(catmullPoint(p0, p1, p2, p3, j / steps));
  }
  points.push({ ...controlPoints[controlPoints.length - 1] });
  return points;
}

export function pointInPolygon(point, polygon = []) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || EPS) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function hatchSegmentsForPolygon(polygon = [], angleDeg = 45, spacing = 10) {
  if (polygon.length < 3) return [];
  const step = Math.max(0.1, Math.abs(Number(spacing) || 10));
  const angle = (Number(angleDeg) || 0) * Math.PI / 180;
  const center = polygon.reduce((acc, p) => ({ x: acc.x + p.x / polygon.length, y: acc.y + p.y / polygon.length }), { x: 0, y: 0 });
  const rotated = polygon.map((point) => rotatePoint(point, center, -angle));
  const minY = Math.min(...rotated.map((p) => p.y));
  const maxY = Math.max(...rotated.map((p) => p.y));
  const segments = [];
  const startY = Math.floor(minY / step) * step;
  for (let y = startY; y <= maxY + EPS; y += step) {
    const xs = [];
    for (let i = 0; i < rotated.length; i += 1) {
      const a = rotated[i];
      const b = rotated[(i + 1) % rotated.length];
      if (Math.abs(a.y - b.y) < EPS) continue;
      const low = Math.min(a.y, b.y);
      const high = Math.max(a.y, b.y);
      if (y < low || y >= high) continue;
      const t = (y - a.y) / (b.y - a.y);
      xs.push(a.x + (b.x - a.x) * t);
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = rotatePoint({ x: xs[i], y }, center, angle);
      const b = rotatePoint({ x: xs[i + 1], y }, center, angle);
      segments.push({ a, b });
    }
  }
  return segments;
}

export function scaleEntityGeometry(entity, base, factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || Math.abs(f) < EPS) throw new Error('Fator de escala inválido.');
  const p = (x, y) => ({ x: base.x + (x - base.x) * f, y: base.y + (y - base.y) * f });
  const g = JSON.parse(JSON.stringify(entity.geometry || {}));
  if (entity.type === 'line' || entity.type === 'centerline') {
    const a = p(g.x1, g.y1); const b = p(g.x2, g.y2);
    return { ...g, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  if (entity.type === 'rect') {
    const a = p(g.x, g.y);
    return { ...g, x: a.x, y: a.y, width: g.width * f, height: g.height * f };
  }
  if (entity.type === 'circle' || entity.type === 'arc') {
    const c = p(g.cx, g.cy);
    return { ...g, cx: c.x, cy: c.y, radius: Math.abs(g.radius * f) };
  }
  if (entity.type === 'polyline') return { ...g, points: (g.points || []).map((pt) => p(pt.x, pt.y)) };
  if (entity.type === 'text') {
    const a = p(g.x, g.y);
    return { ...g, x: a.x, y: a.y, size: Math.max(6, Math.abs((g.size || 14) * f)) };
  }
  if (entity.type === 'shaft') {
    const origin = p(g.origin?.x || 0, g.origin?.y || 0);
    return { ...g, origin, segments: (g.segments || []).map((segment) => ({ ...segment, length: Math.abs(segment.length * f), diameter: Math.abs(segment.diameter * f) })) };
  }
  return g;
}

export function rotateEntityGeometry(entity, base, angle) {
  const g = JSON.parse(JSON.stringify(entity.geometry || {}));
  const p = (x, y) => rotatePoint({ x, y }, base, angle);
  if (entity.type === 'line' || entity.type === 'centerline') {
    const a = p(g.x1, g.y1); const b = p(g.x2, g.y2);
    return { ...g, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  if (entity.type === 'circle' || entity.type === 'arc') {
    const c = p(g.cx, g.cy);
    const next = { ...g, cx: c.x, cy: c.y };
    if (entity.type === 'arc') { next.startAngle += angle; next.endAngle += angle; }
    return next;
  }
  if (entity.type === 'polyline') return { ...g, points: (g.points || []).map((pt) => p(pt.x, pt.y)) };
  if (entity.type === 'text') { const a = p(g.x, g.y); return { ...g, x: a.x, y: a.y }; }
  if (entity.type === 'rect') {
    const corners = [p(g.x, g.y), p(g.x + g.width, g.y), p(g.x + g.width, g.y + g.height), p(g.x, g.y + g.height)];
    return { points: corners, closed: true, __convertToPolyline: true };
  }
  return g;
}

export function rectangularArrayOffsets(rows, columns, rowSpacing, columnSpacing) {
  const result = [];
  for (let r = 0; r < Math.max(1, rows); r += 1) {
    for (let c = 0; c < Math.max(1, columns); c += 1) {
      if (r === 0 && c === 0) continue;
      result.push({ dx: c * columnSpacing, dy: r * rowSpacing });
    }
  }
  return result;
}

export function polarArrayAngles(count, totalAngleDeg = 360) {
  const n = Math.max(2, Math.floor(count));
  const total = Number(totalAngleDeg) * Math.PI / 180;
  const result = [];
  for (let i = 1; i < n; i += 1) result.push((total / n) * i);
  return result;
}

export function projectParameter(point, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const denom = dx * dx + dy * dy || EPS;
  return ((point.x - a.x) * dx + (point.y - a.y) * dy) / denom;
}

export function breakLineGeometry(geometry, p1, p2) {
  const a = { x: geometry.x1, y: geometry.y1 };
  const b = { x: geometry.x2, y: geometry.y2 };
  let t1 = Math.max(0, Math.min(1, projectParameter(p1, a, b)));
  let t2 = Math.max(0, Math.min(1, projectParameter(p2, a, b)));
  if (t1 > t2) [t1, t2] = [t2, t1];
  if (t2 - t1 < 1e-5) throw new Error('Os pontos de quebra precisam ser diferentes.');
  const lerp = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const q1 = lerp(t1); const q2 = lerp(t2);
  const parts = [];
  if (t1 > 1e-5) parts.push({ x1: a.x, y1: a.y, x2: q1.x, y2: q1.y });
  if (t2 < 1 - 1e-5) parts.push({ x1: q2.x, y1: q2.y, x2: b.x, y2: b.y });
  return parts;
}

function near(a, b, tolerance) { return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance; }

export function joinLineSegments(segments = [], tolerance = 0.01) {
  if (segments.length < 2) throw new Error('Selecione pelo menos dois segmentos.');
  const pending = segments.map((s) => ({ a: { x: s.x1, y: s.y1 }, b: { x: s.x2, y: s.y2 } }));
  const first = pending.shift();
  const chain = [first.a, first.b];
  let changed = true;
  while (pending.length && changed) {
    changed = false;
    for (let i = 0; i < pending.length; i += 1) {
      const s = pending[i];
      if (near(chain[chain.length - 1], s.a, tolerance)) chain.push(s.b);
      else if (near(chain[chain.length - 1], s.b, tolerance)) chain.push(s.a);
      else if (near(chain[0], s.b, tolerance)) chain.unshift(s.a);
      else if (near(chain[0], s.a, tolerance)) chain.unshift(s.b);
      else continue;
      pending.splice(i, 1);
      changed = true;
      break;
    }
  }
  if (pending.length) throw new Error('Os segmentos selecionados não formam uma cadeia contínua.');
  const closed = chain.length > 2 && near(chain[0], chain[chain.length - 1], tolerance);
  if (closed) chain.pop();
  return { points: chain, closed };
}
