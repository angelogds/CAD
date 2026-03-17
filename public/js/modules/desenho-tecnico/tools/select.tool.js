import { BaseTool } from './base.tool.js';
import { Bounds2D } from '../core/geometry.js';

export class SelectTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'select';
    this.boxStart = null;
    this.moveStart = null;
    this.dragged = false;
    this.gripDrag = null;
    this.beforeGrip = null;
  }
  getGrips() {
    const selected = this.ctx.state.entities.filter((e) => this.ctx.selection.includes(e.id));
    if (selected.length !== 1) return [];
    const e = selected[0];
    if (e.type === 'line' || e.type === 'centerline') return [{ entityId: e.id, key: 'start', x: e.geometry.x1, y: e.geometry.y1 }, { entityId: e.id, key: 'end', x: e.geometry.x2, y: e.geometry.y2 }];
    if (e.type === 'polyline') return (e.geometry.points || []).map((p, i) => ({ entityId: e.id, key: `v${i}`, index: i, x: p.x, y: p.y }));
    if (e.type === 'rect') {
      const { x, y, width, height } = e.geometry;
      return [{ entityId: e.id, key: 'c1', x, y }, { entityId: e.id, key: 'c2', x: x + width, y }, { entityId: e.id, key: 'c3', x: x + width, y: y + height }, { entityId: e.id, key: 'c4', x, y: y + height }];
    }
    if (e.type === 'circle') return [{ entityId: e.id, key: 'center', x: e.geometry.cx, y: e.geometry.cy }, { entityId: e.id, key: 'radius', x: e.geometry.cx + e.geometry.radius, y: e.geometry.cy }];
    if (e.type === 'text') return [{ entityId: e.id, key: 'pos', x: e.geometry.x, y: e.geometry.y }];
    if (e.type === 'dimension' && e.geometry.textPoint) return [{ entityId: e.id, key: 'textPoint', x: e.geometry.textPoint.x, y: e.geometry.textPoint.y }];
    return [];
  }
  activate() { this.ctx.prompt.set({ message: 'Arraste para selecionar ou clique em uma entidade' }); }
  onMouseDown(evt) {
    const grip = this.getGrips().find((g) => Math.hypot(g.x - evt.world.x, g.y - evt.world.y) <= (10 / this.ctx.viewport.getViewState().zoom));
    if (grip) {
      this.gripDrag = grip;
      const entity = this.ctx.state.entities.find((e) => e.id === grip.entityId);
      this.beforeGrip = JSON.parse(JSON.stringify(entity?.geometry || {}));
      return;
    }
    const hit = this.ctx.findEntityAt(evt.world);
    if (hit && this.ctx.selection.includes(hit.id)) {
      this.moveStart = evt.world;
      this.dragged = false;
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
      this.ctx.markDirty('Edição por grip');
      return;
    }
    if (this.moveStart) {
      const dx = evt.world.x - this.moveStart.x;
      const dy = evt.world.y - this.moveStart.y;
      this.ctx.state.entities.filter((e) => this.ctx.selection.includes(e.id)).forEach((e) => e.move(dx, dy));
      this.moveStart = evt.world;
      this.dragged = true;
      this.ctx.markDirty('Mover seleção');
      return;
    }
    if (this.boxStart) this.ctx.preview.set([{ type: 'selection-box', from: this.boxStart, to: evt.world }]);
  }
  onMouseUp(evt) {
    if (this.gripDrag) {
      this.gripDrag = null;
      this.beforeGrip = null;
      this.ctx.pushHistory();
      return;
    }
    if (this.moveStart) {
      this.moveStart = null;
      if (this.dragged) this.ctx.pushHistory();
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
      const b = new Bounds2D(Math.min(this.boxStart.x, evt.world.x), Math.min(this.boxStart.y, evt.world.y), Math.max(this.boxStart.x, evt.world.x), Math.max(this.boxStart.y, evt.world.y));
      const ids = this.ctx.state.entities.filter((e) => {
        const eb = e.getBounds();
        return eb.minX >= b.minX && eb.maxX <= b.maxX && eb.minY >= b.minY && eb.maxY <= b.maxY;
      }).map((e) => e.id);
      this.ctx.selection.set(ids);
    }
    this.boxStart = null;
    this.ctx.preview.clear();
  }
  applyGrip(entity, grip, point) {
    if (entity.type === 'line' || entity.type === 'centerline') {
      if (grip.key === 'start') { entity.geometry.x1 = point.x; entity.geometry.y1 = point.y; }
      if (grip.key === 'end') { entity.geometry.x2 = point.x; entity.geometry.y2 = point.y; }
    } else if (entity.type === 'polyline') {
      entity.geometry.points[grip.index] = { x: point.x, y: point.y };
    } else if (entity.type === 'rect') {
      const x2 = entity.geometry.x + entity.geometry.width;
      const y2 = entity.geometry.y + entity.geometry.height;
      if (grip.key === 'c1') { entity.geometry.x = point.x; entity.geometry.y = point.y; entity.geometry.width = x2 - point.x; entity.geometry.height = y2 - point.y; }
      if (grip.key === 'c2') { entity.geometry.y = point.y; entity.geometry.width = point.x - entity.geometry.x; entity.geometry.height = y2 - point.y; }
      if (grip.key === 'c3') { entity.geometry.width = point.x - entity.geometry.x; entity.geometry.height = point.y - entity.geometry.y; }
      if (grip.key === 'c4') { entity.geometry.x = point.x; entity.geometry.width = x2 - point.x; entity.geometry.height = point.y - entity.geometry.y; }
    } else if (entity.type === 'circle') {
      if (grip.key === 'center') { entity.geometry.cx = point.x; entity.geometry.cy = point.y; }
      if (grip.key === 'radius') entity.geometry.radius = Math.max(1, Math.hypot(point.x - entity.geometry.cx, point.y - entity.geometry.cy));
    } else if (entity.type === 'text') {
      entity.geometry.x = point.x; entity.geometry.y = point.y;
    } else if (entity.type === 'dimension' && grip.key === 'textPoint') {
      entity.geometry.textPoint = { x: point.x, y: point.y };
    }
  }
  cancel() {
    if (this.gripDrag) {
      const entity = this.ctx.state.entities.find((e) => e.id === this.gripDrag.entityId);
      if (entity && this.beforeGrip) entity.geometry = this.beforeGrip;
    }
    this.boxStart = null; this.moveStart = null; this.gripDrag = null; this.beforeGrip = null; this.ctx.preview.clear();
  }
}
