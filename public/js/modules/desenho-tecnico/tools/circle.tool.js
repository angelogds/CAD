import { BaseTool } from './base.tool.js';
import { CircleEntity } from '../entities/circle.entity.js';
import { distance2D } from '../core/geometry.js';

export class CircleTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'circle'; this.center = null; this.dynamicValue = ''; this.currentRadius = 0; }
  activate() { this.ctx.prompt.set({ message: 'Clique para definir o centro' }); }
  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world);
    if (!this.center) { this.center = p; this.dynamicValue = ''; this.ctx.prompt.set({ message: 'Clique para definir o raio' }); return; }
    const radius = distance2D(this.center, p);
    this.ctx.addEntity(new CircleEntity({ geometry: { cx: this.center.x, cy: this.center.y, radius }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.dynamicValue = '';
    this.currentRadius = 0;
    this.center = null;
    this.ctx.preview.clear();
  }
  onMouseMove(evt) {
    if (!this.center) return;
    const p = this.ctx.getPoint(evt.world);
    const radius = distance2D(this.center, p);
    this.currentRadius = radius;
    this.ctx.preview.set([{ type: 'circle', center: this.center, radius }]);
    const typed = this.dynamicValue ? ` | Entrada: ${this.dynamicValue}` : '';
    this.ctx.statusMessage = `Raio: ${radius.toFixed(2)} mm | Diâmetro: ${(radius * 2).toFixed(2)} mm${typed}`;
  }
  onKeyDown(evt) {
    if (!this.center) return;
    const key = evt.key;
    if (/^[0-9.,]$/.test(key)) {
      this.dynamicValue += key === ',' ? '.' : key;
      this.ctx.statusMessage = `Digite raio e Enter: ${this.dynamicValue}`;
      return;
    }
    if (key === 'Backspace') {
      this.dynamicValue = this.dynamicValue.slice(0, -1);
      return;
    }
    if (key !== 'Enter') return;
    const radius = Number(this.dynamicValue);
    if (!Number.isFinite(radius) || radius <= 0) return;
    this.ctx.addEntity(new CircleEntity({ geometry: { cx: this.center.x, cy: this.center.y, radius }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.center = null;
    this.dynamicValue = '';
    this.currentRadius = 0;
    this.ctx.preview.clear();
  }
  cancel() { this.center = null; this.dynamicValue = ''; this.currentRadius = 0; this.ctx.preview.clear(); }
}
