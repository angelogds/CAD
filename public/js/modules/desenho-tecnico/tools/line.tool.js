import { BaseTool } from './base.tool.js';
import { LineEntity } from '../entities/line.entity.js';
import { distance2D } from '../core/geometry.js';

export class LineTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'line'; this.start = null; }
  activate() { this.ctx.prompt.set({ message: 'Clique para definir o primeiro ponto' }); }
  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world, this.start);
    if (!this.start) {
      this.start = p;
      this.ctx.prompt.set({ message: 'Clique para definir o segundo ponto' });
      return;
    }
    this.ctx.addEntity(new LineEntity({ geometry: { x1: this.start.x, y1: this.start.y, x2: p.x, y2: p.y }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.start = p;
  }
  onMouseMove(evt) {
    if (!this.start) return;
    const p = this.ctx.getPoint(evt.world, this.start);
    this.ctx.preview.set([{ type: 'line', from: this.start, to: p }]);
    this.ctx.statusMessage = `Comprimento: ${distance2D(this.start, p).toFixed(2)}`;
  }
  commit() { this.start = null; this.ctx.preview.clear(); this.ctx.prompt.set({ message: 'Linha finalizada' }); }
  cancel() { this.start = null; this.ctx.preview.clear(); this.ctx.prompt.set({ message: 'Comando linha cancelado' }); }
}
