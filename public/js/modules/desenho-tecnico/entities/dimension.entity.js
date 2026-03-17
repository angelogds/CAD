import { BaseEntity } from './base.entity.js';
import { Bounds2D } from '../core/geometry.js';

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
}
