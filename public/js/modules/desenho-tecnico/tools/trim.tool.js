import { BaseTool } from './base.tool.js';
import { lineIntersection } from './modify.utils.js';

export class TrimTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'trim'; this.boundary = null; }
  activate() { this.ctx.prompt.set({ message: 'Selecione a entidade limite' }); }
  onMouseDown(evt) {
    const hit = this.ctx.findEntityAt(evt.world);
    if (!this.boundary) {
      if (!hit || !['line', 'centerline'].includes(hit.type)) return;
      this.boundary = hit;
      this.ctx.prompt.set({ message: 'Selecione a entidade a ser cortada (lado pelo clique)' });
      return;
    }
    if (!hit || !['line', 'centerline', 'polyline'].includes(hit.type) || hit.id === this.boundary.id) return;
    if (this.trim(hit, evt.world)) {
      this.ctx.pushHistory();
      this.ctx.markDirty('Trim aplicado');
      this.ctx.render();
    }
    this.ctx.preview.clear();
    this.boundary = null;
  }
  onMouseMove(evt) {
    if (!this.boundary) return;
    const hit = this.ctx.findEntityAt(evt.world);
    if (!hit || !['line', 'centerline', 'polyline'].includes(hit.type) || hit.id === this.boundary.id) {
      this.ctx.preview.clear();
      return;
    }
    const ghost = hit.clone();
    if (this.trim(ghost, evt.world)) this.ctx.preview.set([{ type: 'ghost-entity', entity: ghost }]);
  }
  trim(entity, clickPoint) {
    const b1 = { x: this.boundary.geometry.x1, y: this.boundary.geometry.y1 };
    const b2 = { x: this.boundary.geometry.x2, y: this.boundary.geometry.y2 };
    if (entity.type === 'line' || entity.type === 'centerline') {
      const a1 = { x: entity.geometry.x1, y: entity.geometry.y1 };
      const a2 = { x: entity.geometry.x2, y: entity.geometry.y2 };
      const i = lineIntersection(a1, a2, b1, b2);
      if (!i) return false;
      const d1 = Math.hypot(clickPoint.x - a1.x, clickPoint.y - a1.y);
      const d2 = Math.hypot(clickPoint.x - a2.x, clickPoint.y - a2.y);
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
  cancel() { this.boundary = null; this.ctx.preview.clear(); }
}
