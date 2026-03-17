import { BaseTool } from './base.tool.js';
import { DimensionEntity } from '../entities/dimension.entity.js';
import { distance2D } from '../core/geometry.js';

export class DimensionTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'dimension'; this.a = null; }
  activate() {
    if (this.ctx.state.dimensionMode === 'angular') {
      this.ctx.prompt.set({ message: 'Cota angular ainda não disponível' });
      return;
    }
    this.ctx.prompt.set({ message: 'Clique para definir o primeiro ponto da cota' });
  }
  onMouseDown(evt) {
    if (this.ctx.state.dimensionMode === 'angular') return;
    if (this.ctx.state.dimensionMode === 'diameter') {
      const hit = this.ctx.findEntityAt(evt.world);
      if (!hit || hit.type !== 'circle') return this.ctx.prompt.set({ message: 'Selecione um círculo para cota de diâmetro' });
      const d = (hit.geometry.radius * 2).toFixed(2);
      const p1 = { x: hit.geometry.cx - hit.geometry.radius, y: hit.geometry.cy };
      const p2 = { x: hit.geometry.cx + hit.geometry.radius, y: hit.geometry.cy };
      this.ctx.addEntity(new DimensionEntity({ geometry: { p1, p2, textPoint: { x: hit.geometry.cx, y: hit.geometry.cy - hit.geometry.radius - 10 }, label: `⌀ ${d}` }, metadata: { layer: 'cotas' } }));
      return;
    }
    const p = this.ctx.getPoint(evt.world);
    if (!this.a) { this.a = p; this.ctx.prompt.set({ message: 'Clique para definir o segundo ponto da cota' }); return; }
    const mid = { x: (this.a.x + p.x) / 2, y: (this.a.y + p.y) / 2 - 10 };
    this.ctx.addEntity(new DimensionEntity({ geometry: { p1: this.a, p2: p, textPoint: mid, label: distance2D(this.a, p).toFixed(2) }, metadata: { layer: 'cotas' } }));
    this.a = null;
  }
  cancel() { this.a = null; }
}
