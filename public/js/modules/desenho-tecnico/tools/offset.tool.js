import { BaseTool } from './base.tool.js';

export class OffsetTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'offset'; this.base = null; this.distance = 10; }
  activate() {
    const val = Number(window.prompt('Distância do offset', String(this.distance)) || this.distance);
    if (Number.isFinite(val) && val > 0) this.distance = val;
    this.ctx.prompt.set({ message: 'Offset: selecione entidade e indique o lado' });
  }
  onMouseDown(evt) {
    if (!this.base) { this.base = this.ctx.findEntityAt(evt.world); return; }
    const copy = this.createOffset(this.base, evt.world);
    if (!copy) return;
    this.ctx.addEntity(copy);
    this.base = null;
    this.ctx.preview.clear();
  }
  onMouseMove(evt) {
    if (!this.base) return;
    const copy = this.createOffset(this.base, evt.world);
    this.ctx.preview.set(copy ? [{ type: 'ghost-entity', entity: copy }] : []);
  }
  createOffset(entity, point) {
    const d = this.distance;
    const copy = entity.clone();
    copy.id = crypto.randomUUID();
    if (entity.type === 'line' || entity.type === 'centerline') {
      const dx = entity.geometry.x2 - entity.geometry.x1;
      const dy = entity.geometry.y2 - entity.geometry.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const side = ((point.x - entity.geometry.x1) * nx + (point.y - entity.geometry.y1) * ny) >= 0 ? 1 : -1;
      const ox = nx * d * side;
      const oy = ny * d * side;
      copy.geometry.x1 += ox; copy.geometry.y1 += oy; copy.geometry.x2 += ox; copy.geometry.y2 += oy;
      return copy;
    }
    if (entity.type === 'circle') {
      const r = Math.hypot(point.x - entity.geometry.cx, point.y - entity.geometry.cy);
      copy.geometry.radius = Math.max(1, entity.geometry.radius + (r >= entity.geometry.radius ? d : -d));
      return copy;
    }
    if (entity.type === 'rect') {
      const cx = entity.geometry.x + entity.geometry.width / 2;
      const cy = entity.geometry.y + entity.geometry.height / 2;
      const inside = point.x >= Math.min(entity.geometry.x, entity.geometry.x + entity.geometry.width)
        && point.x <= Math.max(entity.geometry.x, entity.geometry.x + entity.geometry.width)
        && point.y >= Math.min(entity.geometry.y, entity.geometry.y + entity.geometry.height)
        && point.y <= Math.max(entity.geometry.y, entity.geometry.y + entity.geometry.height);
      const sign = inside ? -1 : 1;
      copy.geometry.x -= d * sign;
      copy.geometry.y -= d * sign;
      copy.geometry.width += 2 * d * sign;
      copy.geometry.height += 2 * d * sign;
      return copy;
    }
    if (entity.type === 'polyline') {
      const pts = entity.geometry.points || [];
      if (pts.length < 2) return null;
      const dx = pts[pts.length - 1].x - pts[0].x;
      const dy = pts[pts.length - 1].y - pts[0].y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const side = ((point.x - pts[0].x) * nx + (point.y - pts[0].y) * ny) >= 0 ? 1 : -1;
      copy.geometry.points = pts.map((p) => ({ x: p.x + nx * d * side, y: p.y + ny * d * side }));
      return copy;
    }
    return null;
  }
  cancel() { this.base = null; this.ctx.preview.clear(); }
}
