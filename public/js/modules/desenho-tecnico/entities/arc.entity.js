import { BaseEntity } from './base.entity.js';
import { Bounds2D } from '../core/geometry.js';

export class ArcEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'arc' }); }
  getBounds() {
    const { cx = 0, cy = 0, radius = 0 } = this.geometry;
    return new Bounds2D(cx - radius, cy - radius, cx + radius, cy + radius);
  }
}
