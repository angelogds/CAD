import { BaseEntity } from './base.entity.js';
import { Bounds2D, angle2D, distance2D, isAngleBetween, normalizeAngle } from '../core/geometry.js';

const TWO_PI = Math.PI * 2;

function pointAt(cx, cy, radius, angle) {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

export class ArcEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'arc' }); }

  static from3Points(p1, p2, p3, payload = {}) {
    const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(d) < 1e-9) return null;
    const p1sq = p1.x * p1.x + p1.y * p1.y;
    const p2sq = p2.x * p2.x + p2.y * p2.y;
    const p3sq = p3.x * p3.x + p3.y * p3.y;
    const cx = (p1sq * (p2.y - p3.y) + p2sq * (p3.y - p1.y) + p3sq * (p1.y - p2.y)) / d;
    const cy = (p1sq * (p3.x - p2.x) + p2sq * (p1.x - p3.x) + p3sq * (p2.x - p1.x)) / d;
    const radius = distance2D({ x: cx, y: cy }, p1);
    const startAngle = angle2D({ x: cx, y: cy }, p1);
    const midAngle = angle2D({ x: cx, y: cy }, p2);
    const endAngle = angle2D({ x: cx, y: cy }, p3);
    const ccw = isAngleBetween(midAngle, startAngle, endAngle, true);
    return new ArcEntity({
      ...payload,
      geometry: {
        cx,
        cy,
        radius,
        startAngle: normalizeAngle(startAngle),
        endAngle: normalizeAngle(endAngle),
        ccw,
      },
    });
  }

  getSweep() {
    const { startAngle = 0, endAngle = 0, ccw = true } = this.geometry;
    if (ccw) {
      const sweep = normalizeAngle(endAngle - startAngle);
      return sweep === 0 ? TWO_PI : sweep;
    }
    const sweep = normalizeAngle(startAngle - endAngle);
    return sweep === 0 ? TWO_PI : sweep;
  }

  getBounds() {
    const { cx = 0, cy = 0, radius = 0, startAngle = 0, endAngle = 0, ccw = true } = this.geometry;
    const points = [
      pointAt(cx, cy, radius, startAngle),
      pointAt(cx, cy, radius, endAngle),
    ];
    [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach((a) => {
      if (isAngleBetween(a, startAngle, endAngle, ccw)) points.push(pointAt(cx, cy, radius, a));
    });
    return Bounds2D.fromPoints(points);
  }

  hitTest(point, tolerance = 6) {
    const { cx = 0, cy = 0, radius = 0, startAngle = 0, endAngle = 0, ccw = true } = this.geometry;
    const ang = normalizeAngle(angle2D({ x: cx, y: cy }, point));
    if (!isAngleBetween(ang, startAngle, endAngle, ccw)) return false;
    return Math.abs(distance2D(point, { x: cx, y: cy }) - radius) <= tolerance;
  }

  move(dx, dy) {
    this.geometry.cx += dx;
    this.geometry.cy += dy;
  }
}
