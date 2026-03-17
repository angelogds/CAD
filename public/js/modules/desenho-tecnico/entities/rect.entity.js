import { BaseEntity } from './base.entity.js';
import { Bounds2D } from '../core/geometry.js';

export class RectEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'rect' }); }
  getBounds() { const { x, y, width, height } = this.geometry; return new Bounds2D(x, y, x + width, y + height); }
  hitTest(point) { const b = this.getBounds(); return point.x >= b.minX && point.x <= b.maxX && point.y >= b.minY && point.y <= b.maxY; }
}
