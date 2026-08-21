const EPS = 1e-9;

function finitePoint(point) {
  return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

export function buildReflectionMatrixValues(axisStart, axisEnd) {
  if (!finitePoint(axisStart) || !finitePoint(axisEnd)) {
    return { ok: false, error: 'Eixo de espelhamento inválido.' };
  }

  const x1 = Number(axisStart.x);
  const y1 = Number(axisStart.y);
  const dx = Number(axisEnd.x) - x1;
  const dy = Number(axisEnd.y) - y1;
  const length = Math.hypot(dx, dy);
  if (length <= EPS) {
    return { ok: false, error: 'Os dois pontos do eixo de espelhamento devem ser diferentes.' };
  }

  const ux = dx / length;
  const uy = dy / length;
  const m11 = (2 * ux * ux) - 1;
  const m12 = 2 * ux * uy;
  const m21 = m12;
  const m22 = (2 * uy * uy) - 1;
  const tx = x1 - ((m11 * x1) + (m12 * y1));
  const ty = y1 - ((m21 * x1) + (m22 * y1));

  return {
    ok: true,
    values: [
      m11, m12, 0, tx,
      m21, m22, 0, ty,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ],
  };
}

export function reflectPointAcrossAxis(point, axisStart, axisEnd) {
  if (!finitePoint(point)) return { ok: false, error: 'Ponto inválido.' };
  const matrix = buildReflectionMatrixValues(axisStart, axisEnd);
  if (!matrix.ok) return matrix;
  const [m11, m12, , tx, m21, m22, , ty] = matrix.values;
  const x = Number(point.x);
  const y = Number(point.y);
  return {
    ok: true,
    point: {
      x: (m11 * x) + (m12 * y) + tx,
      y: (m21 * x) + (m22 * y) + ty,
    },
  };
}

export function lineEntitySnapshot(entity) {
  if (!entity?.startPoint || !entity?.endPoint) return null;
  return {
    x1: Number(entity.startPoint.x),
    y1: Number(entity.startPoint.y),
    x2: Number(entity.endPoint.x),
    y2: Number(entity.endPoint.y),
  };
}

export function orientFilletArc(arc) {
  if (!arc) return null;
  return arc.ccw === false
    ? { ...arc, startAngle: arc.endAngle, endAngle: arc.startAngle }
    : { ...arc };
}
