import { BaseEntity } from './base.entity.js';
import { Bounds2D } from '../core/geometry.js';

export class TextEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'text' }); }
  getBounds() {
    const size = Number(this.geometry.size || 14);
    const text = String(this.geometry.text || '');
    const w = Math.max(size, text.length * size * 0.6);
    return new Bounds2D(this.geometry.x, this.geometry.y - size, this.geometry.x + w, this.geometry.y + size * 0.25);
  }
  hitTest(point) {
    const b = this.getBounds();
    return point.x >= b.minX && point.x <= b.maxX && point.y >= b.minY && point.y <= b.maxY;
  }
}
