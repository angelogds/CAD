import { BaseTool } from './base.tool.js';
import { angle2D, distance2D } from '../core/geometry.js';

export class MeasureTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'measure';
    this.start = null;
  }

  activate() {
    this.start = null;
    this.ctx.prompt.set({ message: 'Medição: informe o primeiro ponto' });
  }

  describe(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = distance2D(a, b);
    const angle = angle2D(a, b) * 180 / Math.PI;
    return `Distância ${distance.toFixed(3)} mm | ΔX ${dx.toFixed(3)} | ΔY ${dy.toFixed(3)} | Ângulo ${angle.toFixed(3)}°`;
  }

  onMouseDown(evt) {
    const point = this.ctx.getPoint(evt.world, this.start);
    if (!this.start) {
      this.start = point;
      this.ctx.prompt.set({ message: 'Medição: informe o segundo ponto' });
      return;
    }
    this.ctx.statusMessage = this.describe(this.start, point);
    this.ctx.prompt.set({ message: this.ctx.statusMessage });
    this.start = null;
    this.clearPreview();
    this.ctx.render();
  }

  onMouseMove(evt) {
    if (!this.start) return;
    const point = this.ctx.getPoint(evt.world, this.start);
    this.setPreview([{ type: 'line', from: this.start, to: point }]);
    this.ctx.statusMessage = this.describe(this.start, point);
  }

  cancel() {
    this.start = null;
    this.clearPreview();
    this.ctx.prompt.set({ message: 'Medição cancelada' });
  }
}
