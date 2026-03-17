import { BaseTool } from './base.tool.js';
import { ShaftEntity } from '../entities/shaft.entity.js';

export class ShaftTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'shaft';
    this.origin = null;
    this.orientation = 'horizontal';
    this.segments = [];
    this.selectedSegment = -1;
  }

  activate() {
    this.origin = null;
    this.segments = [];
    this.selectedSegment = -1;
    this.ctx.prompt.set({ message: 'Eixo paramétrico: clique origem e adicione trechos (Enter finaliza).' });
  }

  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world, this.origin);
    if (!this.origin) {
      this.origin = p;
      this.orientation = window.prompt('Orientação do eixo (h/v)', 'h')?.toLowerCase() === 'v' ? 'vertical' : 'horizontal';
      this.ctx.prompt.set({ message: 'Trecho: informe comprimento e diâmetro no prompt.' });
      return;
    }
    const length = Number(window.prompt('Comprimento do trecho', '40') || 0);
    const diameter = Number(window.prompt('Diâmetro do trecho', '20') || 0);
    if (!Number.isFinite(length) || !Number.isFinite(diameter) || length <= 0 || diameter <= 0) return;
    this.segments.push({ length, diameter });
    this.selectedSegment = this.segments.length - 1;
    this.updatePreview(p);
    this.ctx.statusMessage = `Eixo: ${this.segments.length} trecho(s), L=${this.segments.reduce((a, s) => a + s.length, 0).toFixed(2)}`;
  }

  onMouseMove(evt) {
    if (!this.origin || !this.segments.length) return;
    this.updatePreview(this.ctx.getPoint(evt.world, this.origin));
  }

  updatePreview(cursorPoint) {
    const geom = { origin: this.origin, orientation: this.orientation, segments: this.segments, selectedSegment: this.selectedSegment };
    this.ctx.preview.set([{ type: 'shaft', geometry: geom, cursorPoint }]);
  }

  commit() {
    if (this.origin && this.segments.length) {
      this.ctx.addEntity(new ShaftEntity({
        geometry: {
          origin: { ...this.origin },
          orientation: this.orientation,
          segments: this.segments.map((s) => ({ ...s })),
        },
        metadata: { layer: this.ctx.state.activeLayer },
      }));
    }
    this.cancel();
    this.ctx.prompt.set({ message: 'Eixo paramétrico finalizado' });
  }

  cancel() {
    this.origin = null;
    this.segments = [];
    this.selectedSegment = -1;
    this.ctx.preview.clear();
  }
}
