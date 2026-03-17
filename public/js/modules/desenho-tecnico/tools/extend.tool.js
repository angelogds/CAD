import { BaseTool } from './base.tool.js';
import { lineIntersection } from './modify.utils.js';

export class ExtendTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'extend'; this.boundary = null; }
  activate() { this.ctx.prompt.set({ message: 'Selecione a entidade limite' }); }
  onMouseDown(evt) {
    const hit = this.ctx.findEntityAt(evt.world);
    if (!this.boundary) {
      if (!hit || !['line', 'centerline'].includes(hit.type)) return;
      this.boundary = hit;
      this.ctx.prompt.set({ message: 'Selecione a entidade a ser estendida' });
      return;
    }
    if (!hit || !['line', 'centerline', 'polyline'].includes(hit.type) || hit.id === this.boundary.id) return;
    if (this.extend(hit, evt.world)) {
      this.ctx.pushHistory();
      this.ctx.markDirty('Extend aplicado');
      this.ctx.render();
    }
    this.boundary = null;
  }
  extend(entity, clickPoint) {
    const b1 = { x: this.boundary.geometry.x1, y: this.boundary.geometry.y1 };
    const b2 = { x: this.boundary.geometry.x2, y: this.boundary.geometry.y2 };
    if (entity.type === 'line' || entity.type === 'centerline') {
      const p1 = { x: entity.geometry.x1, y: entity.geometry.y1 };
      const p2 = { x: entity.geometry.x2, y: entity.geometry.y2 };
      const i = lineIntersection(p1, p2, b1, b2);
      if (!i) return false;
      const d1 = Math.hypot(clickPoint.x - p1.x, clickPoint.y - p1.y);
      const d2 = Math.hypot(clickPoint.x - p2.x, clickPoint.y - p2.y);
      if (d1 < d2) { entity.geometry.x1 = i.x; entity.geometry.y1 = i.y; } else { entity.geometry.x2 = i.x; entity.geometry.y2 = i.y; }
      return true;
    }
    if (entity.type === 'polyline') {
      const pts = entity.geometry.points || [];
      if (pts.length < 2) return false;
      const i0 = lineIntersection(pts[0], pts[1], b1, b2);
      const il = lineIntersection(pts[pts.length - 2], pts[pts.length - 1], b1, b2);
      const d0 = Math.hypot(clickPoint.x - pts[0].x, clickPoint.y - pts[0].y);
      const dl = Math.hypot(clickPoint.x - pts[pts.length - 1].x, clickPoint.y - pts[pts.length - 1].y);
      if (d0 < dl && i0) pts[0] = i0;
      else if (il) pts[pts.length - 1] = il;
      return Boolean(i0 || il);
    }
    return false;
  }
  cancel() { this.boundary = null; }
}
