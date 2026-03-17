import { BaseTool } from './base.tool.js';
import { Bounds2D } from '../core/geometry.js';

export class SelectTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'select';
    this.boxStart = null;
    this.moveStart = null;
    this.moved = false;
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
  cancel() { this.boxStart = null; this.moveStart = null; this.moved = false; this.ctx.preview.clear(); }
}
