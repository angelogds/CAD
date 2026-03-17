import { BaseTool } from './base.tool.js';
import { LineEntity } from '../entities/line.entity.js';
import { distance2D } from '../core/geometry.js';

export class LineTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'line'; this.start = null; }
  activate() { this.ctx.prompt.set({ message: 'Clique para definir o primeiro ponto' }); }
  onMouseDown(evt) {
    if (!this.start) { this.start = evt.world; this.ctx.prompt.set({ message: 'Clique para definir o ponto final' }); return; }
    const ent = new LineEntity({ geometry: { x1: this.start.x, y1: this.start.y, x2: evt.world.x, y2: evt.world.y }, style: { stroke: '#f1f5f9' } });
    this.ctx.addEntity(ent); this.start = null; this.ctx.preview.clear(); this.ctx.prompt.set({ message: 'Linha criada. Clique para definir o primeiro ponto' });
  }
  onMouseMove(evt) {
    if (!this.start) return;
    const len = distance2D(this.start, evt.world).toFixed(2);
    this.ctx.preview.set([{ type: 'line', from: this.start, to: evt.world, length: len }]);
    this.ctx.statusMessage = `Comprimento: ${len}`;
  }
  cancel() { this.start = null; this.ctx.preview.clear(); this.ctx.prompt.set({ message: 'Comando linha cancelado' }); }
}
