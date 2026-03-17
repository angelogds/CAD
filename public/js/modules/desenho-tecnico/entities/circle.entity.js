import { BaseEntity } from './base.entity.js';
import { Bounds2D, distance2D } from '../core/geometry.js';

export class CircleEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'circle' }); }
  getBounds() { const { cx, cy, radius } = this.geometry; return new Bounds2D(cx - radius, cy - radius, cx + radius, cy + radius); }
  hitTest(point, tolerance = 6) { const { cx, cy, radius } = this.geometry; return Math.abs(distance2D(point, { x: cx, y: cy }) - radius) <= tolerance; }
}
