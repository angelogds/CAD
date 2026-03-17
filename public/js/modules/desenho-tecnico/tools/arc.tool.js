import { BaseTool } from './base.tool.js';
import { ArcEntity } from '../entities/arc.entity.js';

export class ArcTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'arc'; this.points = []; }

  activate() {
    this.points = [];
    this.ctx.prompt.set({ message: 'Arco 3 pontos: clique no ponto inicial' });
  }

  onMouseDown(evt) {
    const prev = this.points[this.points.length - 1] || null;
    const p = this.ctx.getPoint(evt.world, prev);
    this.points.push(p);
    if (this.points.length === 1) this.ctx.prompt.set({ message: 'Arco 3 pontos: clique no segundo ponto' });
    if (this.points.length === 2) this.ctx.prompt.set({ message: 'Arco 3 pontos: clique no ponto final' });
    if (this.points.length >= 3) {
      const arc = ArcEntity.from3Points(this.points[0], this.points[1], this.points[2], { metadata: { layer: this.ctx.state.activeLayer } });
      if (!arc) {
        this.ctx.statusMessage = 'Arco inválido (pontos colineares).';
        this.cancel();
        return;
      }
      this.ctx.addEntity(arc);
      this.points = [];
      this.ctx.preview.clear();
      this.ctx.prompt.set({ message: 'Arco criado. Clique para novo arco.' });
    }
  }

  onMouseMove(evt) {
    if (!this.points.length) return;
    const from = this.points[this.points.length - 1] || null;
    const p = this.ctx.getPoint(evt.world, from);
    if (this.points.length === 1) {
      this.ctx.preview.set([{ type: 'line', from: this.points[0], to: p }]);
      return;
    }
    const arc = ArcEntity.from3Points(this.points[0], this.points[1], p);
    if (!arc) {
      this.ctx.preview.set([{ type: 'polyline', points: [this.points[0], this.points[1], p] }]);
      return;
    }
    this.ctx.preview.set([{ type: 'arc', geometry: arc.geometry }]);
  }

  cancel() {
    this.points = [];
    this.ctx.preview.clear();
    this.ctx.prompt.set({ message: 'Comando arco cancelado' });
  }
}
