const EPS = 1e-9;
const TWO_PI = Math.PI * 2;

const clone = (value) => JSON.parse(JSON.stringify(value || {}));
const distance = (a, b) => Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizeAngleRad(angle) {
  let value = Number(angle) % TWO_PI;
  if (value < 0) value += TWO_PI;
  return value;
}

export function rotatePointAround(point, center, angleRad) {
  const angle = Number(angleRad) || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = Number(point.x) - Number(center.x);
  const y = Number(point.y) - Number(center.y);
  return {
    x: Number(center.x) + (x * cos) - (y * sin),
    y: Number(center.y) + (x * sin) + (y * cos),
  };
}

function rotateOptionalPoint(point, center, angleRad) {
  return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
    ? rotatePointAround(point, center, angleRad)
    : point;
}

export function rotateEntitySnapshot(type, geometry, center, angleRad) {
  const g = clone(geometry);
  const angle = Number(angleRad);
  if (!Number.isFinite(angle)) return { ok: false, error: 'Ângulo de rotação inválido.' };
  if (!center || !Number.isFinite(Number(center.x)) || !Number.isFinite(Number(center.y))) {
    return { ok: false, error: 'Ponto base de rotação inválido.' };
  }

  if (type === 'line' || type === 'centerline') {
    const p1 = rotatePointAround({ x: g.x1, y: g.y1 }, center, angle);
    const p2 = rotatePointAround({ x: g.x2, y: g.y2 }, center, angle);
    return { ok: true, type, geometry: { ...g, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y } };
  }

  if (type === 'polyline') {
    return {
      ok: true,
      type,
      geometry: { ...g, points: (g.points || []).map((point) => rotatePointAround(point, center, angle)) },
    };
  }

  if (type === 'rect') {
    const x1 = Number(g.x || 0);
    const y1 = Number(g.y || 0);
    const x2 = x1 + Number(g.width || 0);
    const y2 = y1 + Number(g.height || 0);
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const points = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ].map((point) => rotatePointAround(point, center, angle));
    return { ok: true, type: 'polyline', geometry: { points, closed: true } };
  }

  if (type === 'circle') {
    const c = rotatePointAround({ x: g.cx, y: g.cy }, center, angle);
    return { ok: true, type, geometry: { ...g, cx: c.x, cy: c.y } };
  }

  if (type === 'arc') {
    const c = rotatePointAround({ x: g.cx, y: g.cy }, center, angle);
    return {
      ok: true,
      type,
      geometry: {
        ...g,
        cx: c.x,
        cy: c.y,
        startAngle: normalizeAngleRad(Number(g.startAngle || 0) + angle),
        endAngle: normalizeAngleRad(Number(g.endAngle || 0) + angle),
      },
    };
  }

  if (type === 'text') {
    const p = rotatePointAround({ x: g.x, y: g.y }, center, angle);
    return { ok: true, type, geometry: { ...g, x: p.x, y: p.y } };
  }

  if (type === 'dimension') {
    const next = { ...g };
    if (g.mode === 'angular') {
      next.vertex = rotateOptionalPoint(g.vertex, center, angle);
      next.textPoint = rotateOptionalPoint(g.textPoint, center, angle);
      next.startAngle = normalizeAngleRad(Number(g.startAngle || 0) + angle);
      next.endAngle = normalizeAngleRad(Number(g.endAngle || 0) + angle);
    } else {
      next.p1 = rotateOptionalPoint(g.p1, center, angle);
      next.p2 = rotateOptionalPoint(g.p2, center, angle);
      next.textPoint = rotateOptionalPoint(g.textPoint, center, angle);
    }
    return { ok: true, type, geometry: next };
  }

  return { ok: false, error: `Rotação ainda não suportada para ${type}.` };
}

function lineEndpoints(geometry = {}) {
  return [
    { x: Number(geometry.x1), y: Number(geometry.y1) },
    { x: Number(geometry.x2), y: Number(geometry.y2) },
  ];
}

function infiniteLineIntersection(a1, a2, b1, b2) {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denominator = (dax * dby) - (day * dbx);
  if (Math.abs(denominator) <= EPS) return null;
  const qx = b1.x - a1.x;
  const qy = b1.y - a1.y;
  const t = ((qx * dby) - (qy * dbx)) / denominator;
  return { x: a1.x + (t * dax), y: a1.y + (t * day) };
}

function rayFromPick(geometry, intersection, pick) {
  const endpoints = lineEndpoints(geometry);
  let dx = Number(pick?.x) - intersection.x;
  let dy = Number(pick?.y) - intersection.y;
  let len = Math.hypot(dx, dy);

  if (len <= EPS) {
    const candidate = endpoints
      .map((point, index) => ({ point, index, dist: distance(intersection, point) }))
      .sort((a, b) => b.dist - a.dist)[0];
    dx = candidate.point.x - intersection.x;
    dy = candidate.point.y - intersection.y;
    len = Math.hypot(dx, dy);
  }

  if (len <= EPS) return null;
  const unit = { x: dx / len, y: dy / len };
  const projections = endpoints.map((point) => ((point.x - intersection.x) * unit.x) + ((point.y - intersection.y) * unit.y));
  const farIndex = projections[0] >= projections[1] ? 0 : 1;
  const farProjection = projections[farIndex];
  if (farProjection <= EPS) return null;

  return { unit, farIndex, farProjection, farPoint: endpoints[farIndex] };
}

function trimLineAt(geometry, tangentPoint, farIndex) {
  const next = { ...geometry };
  if (farIndex === 0) {
    next.x1 = Number(geometry.x1);
    next.y1 = Number(geometry.y1);
    next.x2 = tangentPoint.x;
    next.y2 = tangentPoint.y;
  } else {
    next.x1 = tangentPoint.x;
    next.y1 = tangentPoint.y;
    next.x2 = Number(geometry.x2);
    next.y2 = Number(geometry.y2);
  }
  return next;
}

function cornerContext(line1, pick1, line2, pick2) {
  const [a1, a2] = lineEndpoints(line1);
  const [b1, b2] = lineEndpoints(line2);
  if (![a1, a2, b1, b2].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
    return { ok: false, error: 'Geometria de linha inválida.' };
  }

  const intersection = infiniteLineIntersection(a1, a2, b1, b2);
  if (!intersection) return { ok: false, error: 'As linhas são paralelas ou coincidentes.' };

  const ray1 = rayFromPick(line1, intersection, pick1);
  const ray2 = rayFromPick(line2, intersection, pick2);
  if (!ray1 || !ray2) return { ok: false, error: 'Não foi possível determinar o lado das linhas selecionadas.' };

  const dot = clamp((ray1.unit.x * ray2.unit.x) + (ray1.unit.y * ray2.unit.y), -1, 1);
  const theta = Math.acos(dot);
  if (theta <= 1e-6 || Math.abs(Math.PI - theta) <= 1e-6) {
    return { ok: false, error: 'O canto selecionado não possui ângulo válido para a operação.' };
  }

  return { ok: true, intersection, ray1, ray2, theta };
}

export function solveFillet(line1, pick1, line2, pick2, radius) {
  const r = Number(radius);
  if (!Number.isFinite(r) || r <= EPS) return { ok: false, error: 'Informe um raio maior que zero.' };
  const ctx = cornerContext(line1, pick1, line2, pick2);
  if (!ctx.ok) return ctx;

  const tangentDistance = r / Math.tan(ctx.theta / 2);
  if (!Number.isFinite(tangentDistance) || tangentDistance <= EPS) {
    return { ok: false, error: 'Não foi possível calcular a tangência para esse ângulo.' };
  }
  if (tangentDistance > ctx.ray1.farProjection + EPS || tangentDistance > ctx.ray2.farProjection + EPS) {
    return { ok: false, error: 'O raio informado é maior que o espaço disponível nos segmentos selecionados.' };
  }

  const tangent1 = {
    x: ctx.intersection.x + (ctx.ray1.unit.x * tangentDistance),
    y: ctx.intersection.y + (ctx.ray1.unit.y * tangentDistance),
  };
  const tangent2 = {
    x: ctx.intersection.x + (ctx.ray2.unit.x * tangentDistance),
    y: ctx.intersection.y + (ctx.ray2.unit.y * tangentDistance),
  };

  const bisector = { x: ctx.ray1.unit.x + ctx.ray2.unit.x, y: ctx.ray1.unit.y + ctx.ray2.unit.y };
  const bisectorLength = Math.hypot(bisector.x, bisector.y);
  if (bisectorLength <= EPS) return { ok: false, error: 'Bissetriz inválida para o arredondamento.' };
  const centerDistance = r / Math.sin(ctx.theta / 2);
  const center = {
    x: ctx.intersection.x + ((bisector.x / bisectorLength) * centerDistance),
    y: ctx.intersection.y + ((bisector.y / bisectorLength) * centerDistance),
  };

  const startAngle = Math.atan2(tangent1.y - center.y, tangent1.x - center.x);
  const endAngle = Math.atan2(tangent2.y - center.y, tangent2.x - center.x);
  const ccwSweep = normalizeAngleRad(endAngle - startAngle);
  const cwSweep = normalizeAngleRad(startAngle - endAngle);

  return {
    ok: true,
    intersection: ctx.intersection,
    tangent1,
    tangent2,
    center,
    line1: trimLineAt(line1, tangent1, ctx.ray1.farIndex),
    line2: trimLineAt(line2, tangent2, ctx.ray2.farIndex),
    arc: {
      cx: center.x,
      cy: center.y,
      radius: r,
      startAngle: normalizeAngleRad(startAngle),
      endAngle: normalizeAngleRad(endAngle),
      ccw: ccwSweep <= cwSweep,
    },
  };
}

export function solveChamfer(line1, pick1, line2, pick2, distance1, distance2 = distance1) {
  const d1 = Number(distance1);
  const d2 = Number(distance2);
  if (!Number.isFinite(d1) || !Number.isFinite(d2) || d1 <= EPS || d2 <= EPS) {
    return { ok: false, error: 'As distâncias do chanfro devem ser maiores que zero.' };
  }
  const ctx = cornerContext(line1, pick1, line2, pick2);
  if (!ctx.ok) return ctx;
  if (d1 > ctx.ray1.farProjection + EPS || d2 > ctx.ray2.farProjection + EPS) {
    return { ok: false, error: 'O chanfro informado é maior que o comprimento disponível nas linhas.' };
  }

  const point1 = {
    x: ctx.intersection.x + (ctx.ray1.unit.x * d1),
    y: ctx.intersection.y + (ctx.ray1.unit.y * d1),
  };
  const point2 = {
    x: ctx.intersection.x + (ctx.ray2.unit.x * d2),
    y: ctx.intersection.y + (ctx.ray2.unit.y * d2),
  };

  return {
    ok: true,
    intersection: ctx.intersection,
    point1,
    point2,
    line1: trimLineAt(line1, point1, ctx.ray1.farIndex),
    line2: trimLineAt(line2, point2, ctx.ray2.farIndex),
    chamfer: { x1: point1.x, y1: point1.y, x2: point2.x, y2: point2.y },
  };
}


export function solveCircularRecess(targetGeometry, cutterGeometry, targetPick = null) {
  const target = clone(targetGeometry);
  const cutter = clone(cutterGeometry);
  const tCenter = { x: Number(target.cx), y: Number(target.cy) };
  const cCenter = { x: Number(cutter.cx), y: Number(cutter.cy) };
  const r1 = Math.abs(Number(target.radius));
  const r2 = Math.abs(Number(cutter.radius));

  if (![tCenter.x, tCenter.y, cCenter.x, cCenter.y, r1, r2].every(Number.isFinite) || r1 <= EPS || r2 <= EPS) {
    return { ok: false, error: 'Geometria circular inválida.' };
  }

  const dx = cCenter.x - tCenter.x;
  const dy = cCenter.y - tCenter.y;
  const d = Math.hypot(dx, dy);
  if (d <= EPS || d > r1 + r2 + EPS || d < Math.abs(r1 - r2) - EPS) {
    return { ok: false, error: 'Os círculos precisam se cruzar em dois pontos.' };
  }

  const a = ((r1 * r1) - (r2 * r2) + (d * d)) / (2 * d);
  const h2 = (r1 * r1) - (a * a);
  if (h2 <= EPS) return { ok: false, error: 'O aparo circular exige duas interseções distintas.' };

  const h = Math.sqrt(Math.max(0, h2));
  const x0 = tCenter.x + (a * dx) / d;
  const y0 = tCenter.y + (a * dy) / d;
  const rx = -(dy * h) / d;
  const ry = (dx * h) / d;
  const rawIntersections = [
    { x: x0 + rx, y: y0 + ry },
    { x: x0 - rx, y: y0 - ry },
  ];

  const angle = (center, point) => normalizeAngleRad(Math.atan2(point.y - center.y, point.x - center.x));
  const orientedDelta = (from, to, ccw = true) => (
    ccw ? normalizeAngleRad(to - from) : normalizeAngleRad(from - to)
  );
  const isArcGeometry = (geometry) => Number.isFinite(Number(geometry.startAngle)) && Number.isFinite(Number(geometry.endAngle));
  const containsAngle = (geometry, candidateAngle) => {
    if (!isArcGeometry(geometry)) return true;
    const ccw = geometry.ccw !== false;
    const startAngle = normalizeAngleRad(Number(geometry.startAngle));
    const endAngle = normalizeAngleRad(Number(geometry.endAngle));
    let sweep = orientedDelta(startAngle, endAngle, ccw);
    if (sweep <= EPS) sweep = TWO_PI;
    return orientedDelta(startAngle, candidateAngle, ccw) <= sweep + 1e-7;
  };
  const pointOnCircle = (center, radius, candidateAngle) => ({
    x: center.x + Math.cos(candidateAngle) * radius,
    y: center.y + Math.sin(candidateAngle) * radius,
  });
  const midpointAngle = (startAngle, endAngle, ccw = true) => {
    const sweep = orientedDelta(startAngle, endAngle, ccw);
    return normalizeAngleRad(startAngle + (ccw ? 1 : -1) * (sweep / 2));
  };
  const insideCutter = (point) => distance(point, cCenter) <= r2 + 1e-7;

  const intersections = rawIntersections.filter((point) => (
    containsAngle(target, angle(tCenter, point))
    && containsAngle(cutter, angle(cCenter, point))
  ));
  if (intersections.length !== 2) {
    return { ok: false, error: 'As duas interseções precisam pertencer ao trecho circular selecionado.' };
  }

  const targetArcs = [];
  let removedTargetArc = null;

  if (isArcGeometry(target)) {
    const ccw = target.ccw !== false;
    const startAngle = normalizeAngleRad(Number(target.startAngle));
    const endAngle = normalizeAngleRad(Number(target.endAngle));
    let sweep = orientedDelta(startAngle, endAngle, ccw);
    if (sweep <= EPS) sweep = TWO_PI;

    const cuts = intersections
      .map((point) => ({ point, angle: angle(tCenter, point) }))
      .map((item) => ({ ...item, t: orientedDelta(startAngle, item.angle, ccw) }))
      .sort((left, right) => left.t - right.t);

    const middleSweep = cuts[1].t - cuts[0].t;
    const middleAngle = normalizeAngleRad(cuts[0].angle + (ccw ? 1 : -1) * (middleSweep / 2));
    const middlePoint = pointOnCircle(tCenter, r1, middleAngle);

    // Para rebaixo, o trecho removido é sempre o pedaço do contorno que fica
    // dentro do círculo auxiliar. Nunca usamos o clique para escolher o lado,
    // evitando apagar o arco externo errado.
    if (!insideCutter(middlePoint)) {
      return { ok: false, error: 'O círculo auxiliar não envolve o trecho do contorno que deve ser rebaixado.' };
    }

    removedTargetArc = {
      ...target,
      startAngle: cuts[0].angle,
      endAngle: cuts[1].angle,
      ccw,
    };

    if (cuts[0].t > 1e-7) {
      targetArcs.push({
        ...target,
        startAngle,
        endAngle: cuts[0].angle,
        ccw,
      });
    }
    if (sweep - cuts[1].t > 1e-7) {
      targetArcs.push({
        ...target,
        startAngle: cuts[1].angle,
        endAngle,
        ccw,
      });
    }
  } else {
    const p1Target = angle(tCenter, intersections[0]);
    const p2Target = angle(tCenter, intersections[1]);

    const targetCandidates = [
      {
        startAngle: p1Target,
        endAngle: p2Target,
        ccw: true,
      },
      {
        startAngle: p2Target,
        endAngle: p1Target,
        ccw: true,
      },
    ].map((candidate) => {
      const mid = midpointAngle(candidate.startAngle, candidate.endAngle, candidate.ccw);
      const point = pointOnCircle(tCenter, r1, mid);
      return {
        ...candidate,
        point,
        inside: insideCutter(point),
        cutterDistance: distance(point, cCenter),
      };
    }).sort((left, right) => (
      Number(right.inside) - Number(left.inside)
      || left.cutterDistance - right.cutterDistance
    ));

    const removeCandidate = targetCandidates[0];
    const keepCandidate = targetCandidates[1];

    if (!removeCandidate.inside) {
      return { ok: false, error: 'Não foi possível identificar o trecho externo que está dentro do círculo auxiliar.' };
    }

    removedTargetArc = {
      ...target,
      startAngle: removeCandidate.startAngle,
      endAngle: removeCandidate.endAngle,
      ccw: true,
    };

    targetArcs.push({
      ...target,
      startAngle: keepCandidate.startAngle,
      endAngle: keepCandidate.endAngle,
      ccw: true,
    });
  }

  if (!targetArcs.length) {
    return { ok: false, error: 'O aparo removeria todo o trecho circular selecionado.' };
  }

  const p1Cutter = angle(cCenter, intersections[0]);
  const p2Cutter = angle(cCenter, intersections[1]);
  const midpoint = (ccw) => {
    const midAngle = midpointAngle(p1Cutter, p2Cutter, ccw);
    return pointOnCircle(cCenter, r2, midAngle);
  };

  const candidates = [true, false]
    .map((ccw) => ({ ccw, point: midpoint(ccw) }))
    .filter((candidate) => containsAngle(cutter, angle(cCenter, candidate.point)))
    .map((candidate) => ({ ...candidate, dist: distance(candidate.point, tCenter) }))
    .sort((left, right) => left.dist - right.dist);

  if (!candidates.length) return { ok: false, error: 'Não foi possível determinar o arco interno do rebaixo.' };

  const recessArc = {
    ...cutter,
    startAngle: p1Cutter,
    endAngle: p2Cutter,
    ccw: candidates[0].ccw,
  };

  return {
    ok: true,
    intersections,
    targetArcs,
    targetArc: targetArcs[0],
    removedTargetArc,
    recessArc,
    automatic: targetPick == null,
  };
}
