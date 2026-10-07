import { BaseEntity } from './base.entity.js';
import { Bounds2D, angle2D, distance2D, hitTestPointToSegment, isAngleBetween } from '../core/geometry.js';

function projectPointToLine(point, linePoint, unit) {
  const t = (point.x - linePoint.x) * unit.x + (point.y - linePoint.y) * unit.y;
  return { x: linePoint.x + unit.x * t, y: linePoint.y + unit.y * t };
}

function getLinearLayout(geometry = {}) {
  const p1 = geometry.p1;
  const p2 = geometry.p2;
  if (!p1 || !p2) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return null;
  const unit = { x: dx / length, y: dy / length };
  const normal = { x: -unit.y, y: unit.x };
  const middle = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const reference = geometry.dimensionLinePoint || geometry.textPoint || middle;
  const offset = (reference.x - middle.x) * normal.x + (reference.y - middle.y) * normal.y;
  const linePoint = { x: middle.x + normal.x * offset, y: middle.y + normal.y * offset };
  const dimensionStart = projectPointToLine(p1, linePoint, unit);
  const dimensionEnd = projectPointToLine(p2, linePoint, unit);
  return {
    p1,
    p2,
    linePoint,
    dimensionStart,
    dimensionEnd,
    textPoint: geometry.textPoint || linePoint,
  };
}

export class DimensionEntity extends BaseEntity {
  constructor(payload = {}) { super({ ...payload, type: 'dimension' }); }

  getBounds() {
    if (this.geometry.mode === 'angular') {
      const { vertex, radius = 0 } = this.geometry;
      return new Bounds2D(vertex.x - radius, vertex.y - radius, vertex.x + radius, vertex.y + radius);
    }
    const layout = getLinearLayout(this.geometry);
    if (!layout) return new Bounds2D();
    return Bounds2D.fromPoints([
      layout.p1,
      layout.p2,
      layout.dimensionStart,
      layout.dimensionEnd,
      layout.textPoint,
      layout.linePoint,
    ].filter(Boolean));
  }

  hitTest(point, tolerance = 6) {
    if (this.geometry.mode === 'angular') {
      const { vertex, radius = 0, startAngle = 0, endAngle = 0 } = this.geometry;
      if (!vertex) return false;
      const angle = angle2D(vertex, point);
      return Math.abs(distance2D(vertex, point) - radius) <= tolerance
        && isAngleBetween(angle, startAngle, endAngle, true);
    }

    const layout = getLinearLayout(this.geometry);
    if (!layout) return false;
    if (hitTestPointToSegment(point, layout.dimensionStart, layout.dimensionEnd, tolerance)) return true;
    if (hitTestPointToSegment(point, layout.p1, layout.dimensionStart, tolerance)) return true;
    if (hitTestPointToSegment(point, layout.p2, layout.dimensionEnd, tolerance)) return true;
    return layout.textPoint ? distance2D(point, layout.textPoint) <= tolerance * 2 : false;
  }

  move(dx, dy) {
    if (this.geometry.mode === 'angular') {
      ['vertex', 'textPoint'].forEach((key) => {
        const point = this.geometry[key];
        if (!point) return;
        point.x += dx;
        point.y += dy;
      });
      return;
    }

    const layout = getLinearLayout(this.geometry);
    if (!this.geometry.dimensionLinePoint && layout?.linePoint) this.geometry.dimensionLinePoint = { ...layout.linePoint };
    if (!this.geometry.textPoint && layout?.textPoint) this.geometry.textPoint = { ...layout.textPoint };

    ['dimensionLinePoint', 'textPoint'].forEach((key) => {
      const point = this.geometry[key];
      if (!point) return;
      point.x += dx;
      point.y += dy;
    });
  }
}
