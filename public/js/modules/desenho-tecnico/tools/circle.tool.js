import { BaseTool } from './base.tool.js';
import { CircleEntity } from '../entities/circle.entity.js';
import { distance2D } from '../core/geometry.js';

export class CircleTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'circle'; this.center = null; }
  activate() { this.ctx.prompt.set({ message: 'Clique para definir o centro' }); }
  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world);
    if (!this.center) { this.center = p; this.ctx.prompt.set({ message: 'Clique para definir o raio' }); return; }
    const radius = distance2D(this.center, p);
    this.ctx.addEntity(new CircleEntity({ geometry: { cx: this.center.x, cy: this.center.y, radius }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.center = null;
    this.ctx.preview.clear();
  }
  onMouseMove(evt) {
    if (!this.center) return;
    const p = this.ctx.getPoint(evt.world);
    const radius = distance2D(this.center, p);
    this.ctx.preview.set([{ type: 'circle', center: this.center, radius }]);
    this.ctx.statusMessage = `Raio: ${radius.toFixed(2)} | Diâmetro: ${(radius * 2).toFixed(2)}`;
  }
  cancel() { this.center = null; this.ctx.preview.clear(); }
}
