import { BaseTool } from './base.tool.js';
import { Bounds2D } from '../core/geometry.js';

const TWO_PI = Math.PI * 2;

function normalizeAngle(a) {
  let n = a % TWO_PI;
  if (n < 0) n += TWO_PI;
  return n;
}

export class SelectTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'select';
    this.boxStart = null;
    this.moveStart = null;
    this.moved = false;
    this.gripDrag = null;
    this.beforeGrip = null;
    this.gripChanged = false;
  }

  activate() { this.ctx.prompt.set({ message: 'Arraste para selecionar ou clique em uma entidade' }); }

  getGrips() {
    const grips = [];
    this.ctx.state.entities.forEach((entity) => {
      if (!this.ctx.selection.includes(entity.id)) return;
      const g = entity.geometry || {};
      if (entity.type === 'line' || entity.type === 'centerline') {
        grips.push({ entityId: entity.id, role: 'start', x: g.x1, y: g.y1 });
        grips.push({ entityId: entity.id, role: 'end', x: g.x2, y: g.y2 });
      } else if (entity.type === 'polyline') {
        (g.points || []).forEach((p, idx) => grips.push({ entityId: entity.id, role: 'vertex', index: idx, x: p.x, y: p.y }));
      } else if (entity.type === 'rect') {
        const x2 = g.x + g.width;
        const y2 = g.y + g.height;
        const corners = [{ x: g.x, y: g.y }, { x: x2, y: g.y }, { x: x2, y: y2 }, { x: g.x, y: y2 }];
        corners.forEach((p, i) => grips.push({ entityId: entity.id, role: 'corner', index: i, x: p.x, y: p.y }));
      } else if (entity.type === 'circle') {
        grips.push({ entityId: entity.id, role: 'center', x: g.cx, y: g.cy });
        grips.push({ entityId: entity.id, role: 'radius', x: g.cx + g.radius, y: g.cy });
      } else if (entity.type === 'arc') {
        grips.push({ entityId: entity.id, role: 'center', x: g.cx, y: g.cy });
        grips.push({ entityId: entity.id, role: 'start', x: g.cx + Math.cos(g.startAngle) * g.radius, y: g.cy + Math.sin(g.startAngle) * g.radius });
        grips.push({ entityId: entity.id, role: 'end', x: g.cx + Math.cos(g.endAngle) * g.radius, y: g.cy + Math.sin(g.endAngle) * g.radius });
        const mid = normalizeAngle((g.startAngle + g.endAngle) / 2);
        grips.push({ entityId: entity.id, role: 'radius', x: g.cx + Math.cos(mid) * g.radius, y: g.cy + Math.sin(mid) * g.radius });
      } else if (entity.type === 'text') {
        grips.push({ entityId: entity.id, role: 'position', x: g.x, y: g.y });
      } else if (entity.type === 'shaft') {
        grips.push({ entityId: entity.id, role: 'origin', x: g.origin?.x || 0, y: g.origin?.y || 0 });
      } else if (entity.type === 'dimension' && g.textPoint) {
        grips.push({ entityId: entity.id, role: 'textPoint', x: g.textPoint.x, y: g.textPoint.y });
      }
    });
    return grips;
  }

  applyGrip(entity, grip, point) {
    const p = this.ctx.getPoint(point);
    const g = entity.geometry || {};
    if (entity.type === 'line' || entity.type === 'centerline') {
      if (grip.role === 'start') { g.x1 = p.x; g.y1 = p.y; }
      if (grip.role === 'end') { g.x2 = p.x; g.y2 = p.y; }
      return;
    }
    if (entity.type === 'polyline' && grip.role === 'vertex') {
      const v = g.points?.[grip.index];
      if (v) { v.x = p.x; v.y = p.y; }
      return;
    }
    if (entity.type === 'rect' && grip.role === 'corner') {
      const ax = grip.index === 0 || grip.index === 3 ? g.x + g.width : g.x;
      const ay = grip.index === 0 || grip.index === 1 ? g.y + g.height : g.y;
      g.x = p.x;
      g.y = p.y;
      g.width = ax - p.x;
      g.height = ay - p.y;
      return;
    }
    if (entity.type === 'circle') {
      if (grip.role === 'center') { g.cx = p.x; g.cy = p.y; }
      if (grip.role === 'radius') g.radius = Math.max(0.1, Math.hypot(p.x - g.cx, p.y - g.cy));
      return;
    }
    if (entity.type === 'arc') {
      if (grip.role === 'center') { g.cx = p.x; g.cy = p.y; return; }
      if (grip.role === 'start') { g.startAngle = Math.atan2(p.y - g.cy, p.x - g.cx); g.radius = Math.max(0.1, Math.hypot(p.x - g.cx, p.y - g.cy)); return; }
      if (grip.role === 'end') { g.endAngle = Math.atan2(p.y - g.cy, p.x - g.cx); g.radius = Math.max(0.1, Math.hypot(p.x - g.cx, p.y - g.cy)); return; }
      if (grip.role === 'radius') { g.radius = Math.max(0.1, Math.hypot(p.x - g.cx, p.y - g.cy)); }
      return;
    }
    if (entity.type === 'text') { g.x = p.x; g.y = p.y; return; }
    if (entity.type === 'shaft' && g.origin) { g.origin.x = p.x; g.origin.y = p.y; return; }
    if (entity.type === 'dimension' && g.textPoint) { g.textPoint.x = p.x; g.textPoint.y = p.y; }
  }

  onMouseDown(evt) {
    const grip = this.getGrips().find((g) => Math.hypot(g.x - evt.world.x, g.y - evt.world.y) <= (10 / this.ctx.viewport.getViewState().zoom));
    if (grip) {
      this.gripDrag = grip;
      const entity = this.ctx.state.entities.find((e) => e.id === grip.entityId);
      this.beforeGrip = JSON.parse(JSON.stringify(entity?.geometry || {}));
      this.gripChanged = false;
      return;
    }
    const hit = this.ctx.findEntityAt(evt.world);
    if (hit && this.ctx.selection.includes(hit.id)) {
      this.moveStart = evt.world;
      this.moved = false;
      return;
    }
    this.boxStart = evt.world;
  }

  onMouseMove(evt) {
    const hit = this.ctx.findEntityAt(evt.world);
    this.ctx.selection.setHover(hit?.id || null);
    if (this.gripDrag) {
      const entity = this.ctx.state.entities.find((e) => e.id === this.gripDrag.entityId);
      if (!entity) return;
      this.applyGrip(entity, this.gripDrag, evt.world);
      this.gripChanged = true;
      this.ctx.markDirty('Edição por grip');
      return;
    }
    if (this.moveStart) {
      const dx = evt.world.x - this.moveStart.x;
      const dy = evt.world.y - this.moveStart.y;
      this.ctx.state.entities.filter((e) => this.ctx.selection.includes(e.id)).forEach((e) => e.move(dx, dy));
      this.moveStart = evt.world;
      this.moved = true;
      this.ctx.markDirty('Mover seleção');
      return;
    }
    if (this.boxStart) this.ctx.preview.set([{ type: 'selection-box', from: this.boxStart, to: evt.world }]);
  }

  onMouseUp(evt) {
    if (this.gripDrag) {
      if (this.gripChanged) this.ctx.pushHistory?.();
      this.gripDrag = null;
      this.beforeGrip = null;
      this.gripChanged = false;
      return;
    }
    if (this.moveStart) {
      this.moveStart = null;
      if (this.moved) this.ctx.pushHistory?.();
      this.moved = false;
      return;
    }
    if (!this.boxStart) return;
    const startScreen = this.ctx.viewport.worldToScreen(this.boxStart.x, this.boxStart.y);
    const dragDist = Math.hypot(evt.screen.x - startScreen.x, evt.screen.y - startScreen.y);
    if (dragDist < 3) {
      const hit = this.ctx.findEntityAt(evt.world);
      if (!evt.shiftKey && !evt.ctrlKey) this.ctx.selection.clear();
      if (hit) evt.shiftKey || evt.ctrlKey ? this.ctx.selection.toggle(hit.id) : this.ctx.selection.set([hit.id]);
    } else {
      const leftToRight = evt.world.x >= this.boxStart.x;
      const b = new Bounds2D(Math.min(this.boxStart.x, evt.world.x), Math.min(this.boxStart.y, evt.world.y), Math.max(this.boxStart.x, evt.world.x), Math.max(this.boxStart.y, evt.world.y));
      const ids = this.ctx.state.entities.filter((e) => {
        const eb = e.getBounds();
        if (leftToRight) return eb.minX >= b.minX && eb.maxX <= b.maxX && eb.minY >= b.minY && eb.maxY <= b.maxY;
        return eb.maxX >= b.minX && eb.minX <= b.maxX && eb.maxY >= b.minY && eb.minY <= b.maxY;
      }).map((e) => e.id);
      this.ctx.selection.set(ids);
    }
    this.boxStart = null;
    this.ctx.preview.clear();
  }

  cancel() {
    if (this.gripDrag && this.beforeGrip) {
      const entity = this.ctx.state.entities.find((e) => e.id === this.gripDrag.entityId);
      if (entity) entity.geometry = JSON.parse(JSON.stringify(this.beforeGrip));
    }
    this.boxStart = null;
    this.moveStart = null;
    this.moved = false;
    this.gripDrag = null;
    this.beforeGrip = null;
    this.gripChanged = false;
    this.ctx.preview.clear();
    this.ctx.render?.();
  }
}
