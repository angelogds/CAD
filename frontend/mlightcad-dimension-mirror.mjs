import {
  AcDbAlignedDimension,
  AcDbRotatedDimension,
  AcDbRadialDimension,
  AcDbDiametricDimension,
  AcDb3PointAngularDimension
} from '@mlightcad/data-model';

const point = (p) => ({ x: Number(p.x), y: Number(p.y) });
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const turn = Math.PI * 2;
const positiveAngle = (a) => ((a % turn) + turn) % turn;

function labelFor(entity, value, prefix = '', suffix = '') {
  // Explicit annotations (PCD, hole count, fits/tolerances) belong to the drawing.
  const raw = entity.dimensionText;
  if (raw === ' ' || raw === '.') return '';
  let decimals = 3;
  let factor = 1;
  try {
    const style = entity.dimensionStyle;
    if (Number.isInteger(style?.dimdec)) decimals = Math.max(0, Math.min(8, style.dimdec));
    if (!suffix && Number.isFinite(style?.dimlfac) && style.dimlfac !== 0) factor = Math.abs(style.dimlfac);
  } catch (_error) { /* Unattached entities may not have a style table yet. */ }
  const measurement = (value * factor).toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const text = raw == null || raw === '' ? `${prefix}${measurement}${suffix}` : String(raw).replace(/<>/g, measurement);
  return text.replace(/%%c/gi, 'Ø').replace(/%%d/gi, '°').replace(/%%p/gi, '±').replace(/[⌀⌾]/g, 'Ø');
}

function textPointFor(entity, fallback) {
  const p = entity.textPosition;
  // New dimensions default to (0,0). DXF bit 128 also permits an explicit origin.
  return p && (Number(entity.dimensionType) & 128 || Math.abs(p.x) + Math.abs(p.y) > 1e-9)
    ? point(p) : fallback;
}

/** Mirror native DXF dimensions into the existing PDF/SVG schema; never mutate DXF. */
export function mirrorDimension(entity) {
  if (entity instanceof AcDbAlignedDimension) {
    const p1 = point(entity.xLine1Point);
    const p2 = point(entity.xLine2Point);
    const dimLinePoint = point(entity.dimLinePoint);
    const rotation = entity instanceof AcDbRotatedDimension
      ? entity.rotation : Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const u = { x: Math.cos(rotation), y: Math.sin(rotation) };
    const project = (p) => {
      const along = (p.x - dimLinePoint.x) * u.x + (p.y - dimLinePoint.y) * u.y;
      return { x: dimLinePoint.x + u.x * along, y: dimLinePoint.y + u.y * along };
    };
    const dimensionStart = project(p1);
    const dimensionEnd = project(p2);
    return {
      mode: 'linear', p1, p2, dimLinePoint, dimensionStart, dimensionEnd,
      textPoint: textPointFor(entity, middle(dimensionStart, dimensionEnd)),
      label: labelFor(entity, distance(dimensionStart, dimensionEnd))
    };
  }
  if (entity instanceof AcDbRadialDimension || entity instanceof AcDbDiametricDimension) {
    const radial = entity instanceof AcDbRadialDimension;
    const p1 = point(radial ? entity.center : entity.farChordPoint);
    const p2 = point(entity.chordPoint);
    const length = distance(p1, p2);
    const leader = Math.max(0, Number(entity.leaderLength) || 0);
    const fallback = leader && length ? {
      x: p2.x + (p2.x - p1.x) * leader / length,
      y: p2.y + (p2.y - p1.y) * leader / length
    } : middle(p1, p2);
    return {
      mode: radial ? 'radius' : 'diameter', p1, p2,
      dimensionStart: p1, dimensionEnd: p2,
      textPoint: textPointFor(entity, fallback),
      label: labelFor(entity, length, radial ? 'R' : 'Ø')
    };
  }
  if (entity instanceof AcDb3PointAngularDimension) {
    const vertex = point(entity.centerPoint);
    const angle = (p) => Math.atan2(p.y - vertex.y, p.x - vertex.x);
    let startAngle = angle(entity.xLine1Point);
    let endAngle = startAngle + positiveAngle(angle(entity.xLine2Point) - startAngle);
    if (positiveAngle(angle(entity.arcPoint) - startAngle) > endAngle - startAngle) {
      [startAngle, endAngle] = [endAngle, startAngle + turn];
    }
    const radius = distance(vertex, entity.arcPoint);
    const mid = (startAngle + endAngle) / 2;
    return {
      mode: 'angular', vertex, radius, startAngle, endAngle,
      textPoint: textPointFor(entity, { x: vertex.x + Math.cos(mid) * radius, y: vertex.y + Math.sin(mid) * radius }),
      label: labelFor(entity, (endAngle - startAngle) * 180 / Math.PI, '', '°')
    };
  }
  return null;
}
