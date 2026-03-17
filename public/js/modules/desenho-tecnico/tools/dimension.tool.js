import { BaseTool } from './base.tool.js';
import { DimensionEntity } from '../entities/dimension.entity.js';
import { angle2D, distance2D } from '../core/geometry.js';

export class DimensionTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'dimension'; this.a = null; this.angularLineA = null; }

  activate() {
    if (this.ctx.state.dimensionMode === 'angular') {
      this.a = null;
      this.angularLineA = null;
      this.ctx.prompt.set({ message: 'Cota angular: selecione a primeira linha' });
      return;
    }
    this.ctx.prompt.set({ message: 'Clique para definir o primeiro ponto da cota' });
  }

  onMouseDown(evt) {
    if (this.ctx.state.dimensionMode === 'angular') {
      const hit = this.ctx.findEntityAt(evt.world);
      if (!hit || (hit.type !== 'line' && hit.type !== 'centerline')) {
        this.ctx.prompt.set({ message: 'Selecione linhas para cota angular' });
        return;
      }
      if (!this.angularLineA) {
        this.angularLineA = hit;
        this.ctx.prompt.set({ message: 'Selecione a segunda linha' });
        return;
      }
      const l1 = this.angularLineA.geometry;
      const l2 = hit.geometry;
      const a1 = angle2D({ x: l1.x1, y: l1.y1 }, { x: l1.x2, y: l1.y2 });
      const a2 = angle2D({ x: l2.x1, y: l2.y1 }, { x: l2.x2, y: l2.y2 });
      let diff = Math.abs((a2 - a1) * 180 / Math.PI);
      if (diff > 180) diff = 360 - diff;
      const pivot = { x: l1.x1, y: l1.y1 };
      const radius = 24;
      this.ctx.addEntity(new DimensionEntity({
        geometry: {
          mode: 'angular',
          vertex: pivot,
          radius,
          startAngle: a1,
          endAngle: a2,
          label: `${diff.toFixed(2)}°`,
          sourceIds: [this.angularLineA.id, hit.id],
        },
        metadata: { layer: 'cotas' },
      }));
      this.angularLineA = null;
      this.ctx.prompt.set({ message: 'Cota angular criada' });
      return;
    }

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

  cancel() { this.a = null; this.angularLineA = null; }
}
