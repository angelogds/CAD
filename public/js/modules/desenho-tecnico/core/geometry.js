export class Point2D {
  constructor(x = 0, y = 0) { this.x = Number(x) || 0; this.y = Number(y) || 0; }
  clone() { return new Point2D(this.x, this.y); }
}
export class Point3D { constructor(x = 0, y = 0, z = 0) { this.x = Number(x)||0; this.y = Number(y)||0; this.z = Number(z)||0; } }
export class Vector2D { constructor(x = 0, y = 0) { this.x = x; this.y = y; } length() { return Math.hypot(this.x, this.y); } }
export class Vector3D { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} }
export class Rectangle2D { constructor(x=0,y=0,width=0,height=0){this.x=x;this.y=y;this.width=width;this.height=height;} }

export class Bounds2D {
  constructor(minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity) {
    this.minX = minX; this.minY = minY; this.maxX = maxX; this.maxY = maxY;
  }
  static fromPoints(points = []) { const b = new Bounds2D(); points.forEach((p) => b.expandByPoint(p)); return b; }
  isValid() { return Number.isFinite(this.minX) && Number.isFinite(this.minY) && Number.isFinite(this.maxX) && Number.isFinite(this.maxY); }
  expandByPoint(p) { if (!p) return; this.minX = Math.min(this.minX, p.x); this.minY = Math.min(this.minY, p.y); this.maxX = Math.max(this.maxX, p.x); this.maxY = Math.max(this.maxY, p.y); }
  expandByBounds(bounds) { if (bounds?.isValid()) { this.expandByPoint({ x: bounds.minX, y: bounds.minY }); this.expandByPoint({ x: bounds.maxX, y: bounds.maxY }); } }
  width() { return this.isValid() ? this.maxX - this.minX : 0; }
  height() { return this.isValid() ? this.maxY - this.minY : 0; }
  center() { return new Point2D((this.minX + this.maxX) / 2, (this.minY + this.maxY) / 2); }
}
export class Bounds3D { constructor(minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity){Object.assign(this,{minX,minY,minZ,maxX,maxY,maxZ});}}

export class Matrix3 {
  constructor(values) { this.values = values || [1,0,0,0,1,0,0,0,1]; }
  static identity() { return new Matrix3(); }
  static translation(tx, ty) { return new Matrix3([1,0,tx,0,1,ty,0,0,1]); }
  static scale(sx, sy = sx) { return new Matrix3([sx,0,0,0,sy,0,0,0,1]); }
  multiply(other) {
    const a = this.values; const b = other.values; const v = Array(9).fill(0);
    for (let r=0;r<3;r++) for (let c=0;c<3;c++) v[r*3+c] = a[r*3+0]*b[c+0] + a[r*3+1]*b[c+3] + a[r*3+2]*b[c+6];
    return new Matrix3(v);
  }
  transformPoint(p) { const m = this.values; return new Point2D(m[0]*p.x + m[1]*p.y + m[2], m[3]*p.x + m[4]*p.y + m[5]); }
}

export const distance2D = (a, b) => Math.hypot((b.x - a.x), (b.y - a.y));
export const angle2D = (a, b) => Math.atan2((b.y - a.y), (b.x - a.x));
export const EPSILON = 1e-9;

export const isFinitePoint = (point) => Boolean(
  point
  && Number.isFinite(Number(point.x))
  && Number.isFinite(Number(point.y)),
);

export function normalizeRect(x, y, width, height) {
  const x2 = Number(x) + Number(width);
  const y2 = Number(y) + Number(height);
  return {
    x: Math.min(Number(x), x2),
    y: Math.min(Number(y), y2),
    width: Math.abs(Number(width)),
    height: Math.abs(Number(height)),
  };
}
export const normalizeAngle = (a) => {
  let n = a % (Math.PI * 2);
  if (n < 0) n += Math.PI * 2;
  return n;
};
export const isAngleBetween = (angle, start, end, ccw = true) => {
  const a = normalizeAngle(angle);
  const s = normalizeAngle(start);
  const e = normalizeAngle(end);
  if (ccw) {
    if (s <= e) return a >= s && a <= e;
    return a >= s || a <= e;
  }
  if (e <= s) return a <= s && a >= e;
  return a <= s || a >= e;
};
export const rotatePoint = (p, angleRad, center = new Point2D()) => {
  const x = p.x - center.x; const y = p.y - center.y;
  return new Point2D(center.x + x * Math.cos(angleRad) - y * Math.sin(angleRad), center.y + x * Math.sin(angleRad) + y * Math.cos(angleRad));
};
export const translatePoint = (p, dx, dy) => new Point2D(p.x + dx, p.y + dy);
export const scalePoint = (p, sx, sy = sx, center = new Point2D()) => new Point2D(center.x + (p.x - center.x) * sx, center.y + (p.y - center.y) * sy);

export function hitTestPointToSegment(point, a, b, tolerance = 6) {
  return projectPointToSegment(point, a, b).distance <= tolerance;
}

export function projectPointToSegment(point, a, b) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: point.x - a.x, y: point.y - a.y };
  const len2 = ab.x * ab.x + ab.y * ab.y;
  if (len2 <= EPSILON) return { point: { x: a.x, y: a.y }, t: 0, distance: distance2D(point, a) };
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / len2));
  const projected = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return { point: projected, t, distance: distance2D(point, projected) };
}

export function lineIntersection(a1, a2, b1, b2, options = {}) {
  const segmentA = options.segmentA === true;
  const segmentB = options.segmentB === true;
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denominator = dax * dby - day * dbx;
  if (Math.abs(denominator) <= EPSILON) return null;
  const qx = b1.x - a1.x;
  const qy = b1.y - a1.y;
  const t = (qx * dby - qy * dbx) / denominator;
  const u = (qx * day - qy * dax) / denominator;
  if (segmentA && (t < -EPSILON || t > 1 + EPSILON)) return null;
  if (segmentB && (u < -EPSILON || u > 1 + EPSILON)) return null;
  return { x: a1.x + t * dax, y: a1.y + t * day, t, u };
}

export function segmentIntersection(a1, a2, b1, b2) {
  return lineIntersection(a1, a2, b1, b2, { segmentA: true, segmentB: true });
}

export function lineCircleIntersections(a, b, center, radius, segmentOnly = true) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - center.x;
  const fy = a.y - center.y;
  const qa = dx * dx + dy * dy;
  if (qa <= EPSILON || !Number.isFinite(radius) || radius < 0) return [];
  const qb = 2 * (fx * dx + fy * dy);
  const qc = fx * fx + fy * fy - radius * radius;
  const discriminant = qb * qb - 4 * qa * qc;
  if (discriminant < -EPSILON) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  const values = [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)];
  const unique = [];
  values.forEach((t) => {
    if (segmentOnly && (t < -EPSILON || t > 1 + EPSILON)) return;
    const point = { x: a.x + t * dx, y: a.y + t * dy, t };
    if (!unique.some((p) => distance2D(p, point) <= EPSILON)) unique.push(point);
  });
  return unique;
}

export function circleCircleIntersections(c1, r1, c2, r2) {
  const d = distance2D(c1, c2);
  if (d <= EPSILON || d > r1 + r2 + EPSILON || d < Math.abs(r1 - r2) - EPSILON) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < -EPSILON) return [];
  const h = Math.sqrt(Math.max(0, h2));
  const x0 = c1.x + (a * (c2.x - c1.x)) / d;
  const y0 = c1.y + (a * (c2.y - c1.y)) / d;
  const rx = -(c2.y - c1.y) * (h / d);
  const ry = (c2.x - c1.x) * (h / d);
  const points = [{ x: x0 + rx, y: y0 + ry }];
  if (h > EPSILON) points.push({ x: x0 - rx, y: y0 - ry });
  return points;
}

export function parseCadPointInput(raw, basePoint = null, cursorPoint = null) {
  const text = String(raw || '').trim().replace(/\s+/g, '');
  if (!text) return null;
  const relative = text.startsWith('@');
  const body = relative ? text.slice(1) : text;
  if (body.includes('<')) {
    if (!basePoint) return null;
    const [distanceRaw, angleRaw] = body.split('<');
    const length = Number(distanceRaw);
    const degrees = Number(angleRaw);
    if (!Number.isFinite(length) || length < 0 || !Number.isFinite(degrees)) return null;
    const radians = degrees * Math.PI / 180;
    return { x: basePoint.x + Math.cos(radians) * length, y: basePoint.y + Math.sin(radians) * length };
  }
  const coordinates = body.split(/[;,]/);
  if (coordinates.length === 2) {
    const x = Number(coordinates[0]);
    const y = Number(coordinates[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (relative) {
      if (!basePoint) return null;
      return { x: basePoint.x + x, y: basePoint.y + y };
    }
    return { x, y };
  }
  const length = Number(body);
  if (!Number.isFinite(length) || length < 0 || !basePoint) return null;
  const target = cursorPoint || { x: basePoint.x + 1, y: basePoint.y };
  const dx = target.x - basePoint.x;
  const dy = target.y - basePoint.y;
  const currentLength = Math.hypot(dx, dy) || 1;
  return { x: basePoint.x + (dx / currentLength) * length, y: basePoint.y + (dy / currentLength) * length };
}

export function snapPoint(point, { gridEnabled = false, gridSize = 10 } = {}) {
  if (!gridEnabled) return point;
  return new Point2D(Math.round(point.x / gridSize) * gridSize, Math.round(point.y / gridSize) * gridSize);
}
