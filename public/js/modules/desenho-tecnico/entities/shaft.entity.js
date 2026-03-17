import { BaseEntity } from './base.entity.js';
import { Bounds2D } from '../core/geometry.js';

export class ShaftEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'shaft' }); }

  getBounds() {
    const { origin = { x: 0, y: 0 }, orientation = 'horizontal', segments = [] } = this.geometry;
    let x = origin.x;
    let y = origin.y;
    const b = new Bounds2D();
    segments.forEach((s) => {
      const len = Number(s.length || 0);
      const r = Number(s.diameter || 0) / 2;
      if (orientation === 'horizontal') {
        b.expandByPoint({ x, y: y - r });
        b.expandByPoint({ x: x + len, y: y + r });
        x += len;
      } else {
        b.expandByPoint({ x: x - r, y });
        b.expandByPoint({ x: x + r, y: y + len });
        y += len;
      }
    });
    return b;
  }

  hitTest(point, tolerance = 6) {
    const b = this.getBounds();
    return point.x >= b.minX - tolerance && point.x <= b.maxX + tolerance && point.y >= b.minY - tolerance && point.y <= b.maxY + tolerance;
  }

  move(dx, dy) {
    this.geometry.origin.x += dx;
    this.geometry.origin.y += dy;
  }
}
