import { BaseEntity } from './base.entity.js';
import { Bounds2D, angle2D, distance2D, hitTestPointToSegment, isAngleBetween } from '../core/geometry.js';

export class DimensionEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'dimension' }); }
  getBounds() {
    if (this.geometry.mode === 'angular') {
      const { vertex, radius = 0 } = this.geometry;
      return new Bounds2D(vertex.x - radius, vertex.y - radius, vertex.x + radius, vertex.y + radius);
    }
    const points = [this.geometry.p1, this.geometry.p2, this.geometry.textPoint].filter(Boolean);
    return Bounds2D.fromPoints(points);
  }

  hitTest(point, tolerance = 6) {
    if (this.geometry.mode === 'angular') {
      const { vertex, radius = 0, startAngle = 0, endAngle = 0 } = this.geometry;
      if (!vertex) return false;
      const angle = angle2D(vertex, point);
      return Math.abs(distance2D(vertex, point) - radius) <= tolerance
        && isAngleBetween(angle, startAngle, endAngle, true);
    }
    const { p1, p2, textPoint } = this.geometry;
    if (p1 && p2 && hitTestPointToSegment(point, p1, p2, tolerance)) return true;
    return textPoint ? distance2D(point, textPoint) <= tolerance * 2 : false;
  }

  move(dx, dy) {
    ['p1', 'p2', 'textPoint', 'vertex'].forEach((key) => {
      const point = this.geometry[key];
      if (!point) return;
      point.x += dx;
      point.y += dy;
    });
  }
}
