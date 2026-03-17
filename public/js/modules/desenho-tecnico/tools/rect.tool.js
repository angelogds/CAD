import { BaseTool } from './base.tool.js';
import { RectEntity } from '../entities/rect.entity.js';

export class RectTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'rect'; this.start = null; }
  activate() { this.ctx.prompt.set({ message: 'Clique para definir o primeiro canto' }); }
  onMouseDown(evt) { this.start = this.ctx.getPoint(evt.world); }
  onMouseMove(evt) { if (this.start) this.ctx.preview.set([{ type: 'rect', from: this.start, to: this.ctx.getPoint(evt.world) }]); }
  onMouseUp(evt) {
    if (!this.start) return;
    const p = this.ctx.getPoint(evt.world);
    this.ctx.addEntity(new RectEntity({ geometry: { x: this.start.x, y: this.start.y, width: p.x - this.start.x, height: p.y - this.start.y }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.start = null;
    this.ctx.preview.clear();
  }
  cancel() { this.start = null; this.ctx.preview.clear(); }
}
