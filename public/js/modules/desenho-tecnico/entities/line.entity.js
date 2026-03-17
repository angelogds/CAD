import { BaseEntity } from './base.entity.js';
import { Bounds2D, hitTestPointToSegment } from '../core/geometry.js';

export class LineEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: payload.type || 'line' }); }
  getBounds() { const { x1, y1, x2, y2 } = this.geometry; return new Bounds2D(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)); }
  hitTest(point, tolerance = 6) { const g = this.geometry; return hitTestPointToSegment(point, { x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }, tolerance); }
}
