import { BaseEntity } from './base.entity.js';
import { Bounds2D, hitTestPointToSegment } from '../core/geometry.js';

export class PolylineEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'polyline' }); }
  getBounds() {
    const points = Array.isArray(this.geometry.points) ? this.geometry.points : [];
    return Bounds2D.fromPoints(points);
  }
  hitTest(point, tolerance = 6) {
    const points = Array.isArray(this.geometry.points) ? this.geometry.points : [];
    for (let i = 0; i < points.length - 1; i += 1) {
      if (hitTestPointToSegment(point, points[i], points[i + 1], tolerance)) return true;
    }
    return false;
  }
  move(dx, dy) {
    (this.geometry.points || []).forEach((p) => { p.x += dx; p.y += dy; });
  }
}
