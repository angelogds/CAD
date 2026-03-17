import { BaseTool } from './base.tool.js';
import { LineEntity } from '../entities/line.entity.js';

export class CenterlineTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'centerline'; this.start = null; }
  activate() { this.ctx.prompt.set({ message: 'Linha de centro: clique primeiro e segundo ponto' }); }
  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world);
    if (!this.start) { this.start = p; return; }
    this.ctx.addEntity(new LineEntity({ type: 'centerline', geometry: { x1: this.start.x, y1: this.start.y, x2: p.x, y2: p.y }, metadata: { layer: 'linhas_de_centro' }, style: { stroke: '#93c5fd' } }));
    this.start = null;
    this.ctx.preview.clear();
  }
  onMouseMove(evt) { if (this.start) this.ctx.preview.set([{ type: 'line', from: this.start, to: this.ctx.getPoint(evt.world) }]); }
  cancel() { this.start = null; this.ctx.preview.clear(); }
}
