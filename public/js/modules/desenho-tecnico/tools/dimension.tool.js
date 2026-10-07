import { BaseTool } from './base.tool.js';
import { DimensionEntity } from '../entities/dimension.entity.js';
import { angle2D, distance2D } from '../core/geometry.js';

function resolveLinearPlacement(p1, p2, rawPoint) {
  const dx = Number(p2.x) - Number(p1.x);
  const dy = Number(p2.y) - Number(p1.y);
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return null;
  const ux = dx / length;
  const uy = dy / length;
  const normal = { x: -uy, y: ux };
  const middle = { x: (Number(p1.x) + Number(p2.x)) / 2, y: (Number(p1.y) + Number(p2.y)) / 2 };
  const offset = (Number(rawPoint.x) - middle.x) * normal.x + (Number(rawPoint.y) - middle.y) * normal.y;
  const linePoint = { x: middle.x + normal.x * offset, y: middle.y + normal.y * offset };
  return { linePoint, textPoint: { ...linePoint } };
}

function buildLinearGeometry(p1, p2, placement, label, mode = 'aligned') {
  const resolved = resolveLinearPlacement(p1, p2, placement);
  if (!resolved) return null;
  return {
    mode,
    p1: { ...p1 },
    p2: { ...p2 },
    dimensionLinePoint: resolved.linePoint,
    textPoint: resolved.textPoint,
    label,
  };
}

export class DimensionTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'dimension';
    this.a = null;
    this.b = null;
    this.angularLineA = null;
    this.diameterEntity = null;
  }

  activate() {
    this.a = null;
    this.b = null;
    this.angularLineA = null;
    this.diameterEntity = null;
    this.clearPreview();

    if (this.ctx.state.dimensionMode === 'angular') {
      this.ctx.prompt.set({ message: 'Cota angular: selecione a primeira linha' });
      return;
    }
    if (this.ctx.state.dimensionMode === 'diameter') {
      this.ctx.prompt.set({ message: 'Cota de diâmetro: clique no círculo e depois posicione a cota fora da peça' });
      return;
    }
    this.ctx.prompt.set({ message: 'Cotar: clique no primeiro ponto, no segundo ponto e depois posicione a linha de cota' });
  }

  finishLinear(placement) {
    const geometry = buildLinearGeometry(
      this.a,
      this.b,
      placement,
      distance2D(this.a, this.b).toFixed(2),
      'aligned',
    );
    if (!geometry) return;
    this.ctx.addEntity(new DimensionEntity({
      geometry,
      style: { color: '#166534', lineType: 'Continuous', lineWeight: 18, lineTypeScale: 1 },
      metadata: { layer: 'cotas' },
    }));
    this.a = null;
    this.b = null;
    this.clearPreview();
    this.ctx.prompt.set({ message: 'Cota criada. Selecione-a para reposicionar ou editar o estilo.' });
  }

  finishDiameter(placement) {
    const hit = this.diameterEntity;
    if (!hit) return;
    const radius = Number(hit.geometry.radius || 0);
    const p1 = { x: hit.geometry.cx - radius, y: hit.geometry.cy };
    const p2 = { x: hit.geometry.cx + radius, y: hit.geometry.cy };
    const geometry = buildLinearGeometry(p1, p2, placement, `Ø ${(radius * 2).toFixed(2)}`, 'diameter');
    if (!geometry) return;
    geometry.sourceIds = [hit.id];
    this.ctx.addEntity(new DimensionEntity({
      geometry,
      style: { color: '#166534', lineType: 'Continuous', lineWeight: 18, lineTypeScale: 1 },
      metadata: { layer: 'cotas' },
    }));
    this.diameterEntity = null;
    this.clearPreview();
    this.ctx.prompt.set({ message: 'Cota de diâmetro criada. Selecione-a para reposicionar ou editar o estilo.' });
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
        style: { color: '#166534', lineType: 'Continuous', lineWeight: 18, lineTypeScale: 1 },
        metadata: { layer: 'cotas' },
      }));
      this.angularLineA = null;
      this.ctx.prompt.set({ message: 'Cota angular criada' });
      return;
    }

    if (this.ctx.state.dimensionMode === 'diameter') {
      if (!this.diameterEntity) {
        const hit = this.ctx.findEntityAt(evt.world);
        if (!hit || hit.type !== 'circle') {
          this.ctx.prompt.set({ message: 'Selecione um círculo para cota de diâmetro' });
          return;
        }
        this.diameterEntity = hit;
        this.ctx.prompt.set({ message: 'Agora clique onde deseja posicionar a linha de cota' });
        return;
      }
      this.finishDiameter(this.ctx.getPoint(evt.world));
      return;
    }

    const p = this.ctx.getPoint(evt.world, this.a || this.b);
    if (!this.a) {
      this.a = p;
      this.ctx.prompt.set({ message: 'Clique no segundo ponto da medida' });
      return;
    }
    if (!this.b) {
      this.b = p;
      this.ctx.prompt.set({ message: 'Puxe a cota para fora da peça e clique para posicionar' });
      return;
    }
    this.finishLinear(p);
  }

  onMouseMove(evt) {
    const mode = this.ctx.state.dimensionMode;
    if (mode === 'angular') return;

    if (mode === 'diameter' && this.diameterEntity) {
      const radius = Number(this.diameterEntity.geometry.radius || 0);
      const p1 = { x: this.diameterEntity.geometry.cx - radius, y: this.diameterEntity.geometry.cy };
      const p2 = { x: this.diameterEntity.geometry.cx + radius, y: this.diameterEntity.geometry.cy };
      const geometry = buildLinearGeometry(p1, p2, this.ctx.getPoint(evt.world), `Ø ${(radius * 2).toFixed(2)}`, 'diameter');
      if (geometry) this.setPreview([{ type: 'dimension-preview', geometry }]);
      return;
    }

    if (this.a && !this.b) {
      const point = this.ctx.getPoint(evt.world, this.a);
      this.setPreview([{ type: 'line', from: this.a, to: point }]);
      this.ctx.statusMessage = `Medida: ${distance2D(this.a, point).toFixed(2)} mm`;
      return;
    }

    if (this.a && this.b) {
      const geometry = buildLinearGeometry(
        this.a,
        this.b,
        this.ctx.getPoint(evt.world),
        distance2D(this.a, this.b).toFixed(2),
        'aligned',
      );
      if (geometry) this.setPreview([{ type: 'dimension-preview', geometry }]);
      this.ctx.statusMessage = `Cota: ${distance2D(this.a, this.b).toFixed(2)} mm • clique para posicionar`;
    }
  }

  cancel() {
    this.a = null;
    this.b = null;
    this.angularLineA = null;
    this.diameterEntity = null;
    this.clearPreview();
    this.ctx.prompt.set({ message: 'Cotação cancelada' });
  }

  deactivate() {
    this.cancel();
  }
}
