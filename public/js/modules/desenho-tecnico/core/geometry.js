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
export const rotatePoint = (p, angleRad, center = new Point2D()) => {
  const x = p.x - center.x; const y = p.y - center.y;
  return new Point2D(center.x + x * Math.cos(angleRad) - y * Math.sin(angleRad), center.y + x * Math.sin(angleRad) + y * Math.cos(angleRad));
};
export const translatePoint = (p, dx, dy) => new Point2D(p.x + dx, p.y + dy);
export const scalePoint = (p, sx, sy = sx, center = new Point2D()) => new Point2D(center.x + (p.x - center.x) * sx, center.y + (p.y - center.y) * sy);

export function hitTestPointToSegment(point, a, b, tolerance = 6) {
  const ab = { x: b.x - a.x, y: b.y - a.y }; const ap = { x: point.x - a.x, y: point.y - a.y };
  const len2 = ab.x * ab.x + ab.y * ab.y; if (!len2) return distance2D(point, a) <= tolerance;
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / len2));
  const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return distance2D(point, proj) <= tolerance;
}

export function snapPoint(point, { gridEnabled = false, gridSize = 10 } = {}) {
  if (!gridEnabled) return point;
  return new Point2D(Math.round(point.x / gridSize) * gridSize, Math.round(point.y / gridSize) * gridSize);
}
