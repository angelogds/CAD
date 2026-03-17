import { BaseTool } from './base.tool.js';
import { PolylineEntity } from '../entities/polyline.entity.js';

export class PolylineTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'polyline'; this.points = []; }
  activate() { this.ctx.prompt.set({ message: 'Clique para definir o primeiro ponto da polilinha' }); }
  onMouseDown(evt) { this.points.push(this.ctx.getPoint(evt.world, this.points[this.points.length - 1])); }
  onMouseMove(evt) {
    if (!this.points.length) return;
    this.ctx.preview.set([{ type: 'polyline', points: [...this.points, this.ctx.getPoint(evt.world, this.points[this.points.length - 1])] }]);
  }
  onDblClick() { this.commit(); }
  commit() {
    if (this.points.length > 1) this.ctx.addEntity(new PolylineEntity({ geometry: { points: [...this.points] }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.points = [];
    this.ctx.preview.clear();
    this.ctx.prompt.set({ message: 'Polilinha finalizada' });
  }
  cancel() { this.points = []; this.ctx.preview.clear(); this.ctx.prompt.set({ message: 'Polilinha cancelada' }); }
}
