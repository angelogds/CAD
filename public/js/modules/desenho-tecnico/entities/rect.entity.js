import { BaseEntity } from './base.entity.js';
import { Bounds2D, hitTestPointToSegment, normalizeRect } from '../core/geometry.js';

export class RectEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'rect' }); }
  getBounds() {
    const { x, y, width, height } = normalizeRect(this.geometry.x, this.geometry.y, this.geometry.width, this.geometry.height);
    return new Bounds2D(x, y, x + width, y + height);
  }
  hitTest(point, tolerance = 6) {
    const b = this.getBounds();
    const corners = [
      { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
      { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
    ];
    return corners.some((corner, index) => hitTestPointToSegment(point, corner, corners[(index + 1) % corners.length], tolerance));
  }
}
