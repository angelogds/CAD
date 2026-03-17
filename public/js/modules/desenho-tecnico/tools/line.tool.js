import { BaseTool } from './base.tool.js';
import { LineEntity } from '../entities/line.entity.js';
import { distance2D } from '../core/geometry.js';

export class LineTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'line'; this.start = null; this.dynamicValue = ''; this.currentPoint = null; }
  activate() { this.ctx.prompt.set({ message: 'Clique para definir o primeiro ponto' }); }
  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world, this.start);
    if (!this.start) {
      this.start = p;
      this.dynamicValue = '';
      this.ctx.prompt.set({ message: 'Clique para definir o segundo ponto' });
      return;
    }
    this.ctx.addEntity(new LineEntity({ geometry: { x1: this.start.x, y1: this.start.y, x2: p.x, y2: p.y }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.dynamicValue = '';
    this.start = p;
  }
  onMouseMove(evt) {
    if (!this.start) return;
    const p = this.ctx.getPoint(evt.world, this.start);
    this.currentPoint = p;
    this.ctx.preview.set([{ type: 'line', from: this.start, to: p }]);
    const typed = this.dynamicValue ? ` | Entrada: ${this.dynamicValue}` : '';
    this.ctx.statusMessage = `Comprimento: ${distance2D(this.start, p).toFixed(2)} mm${typed}`;
  }
  onKeyDown(evt) {
    if (!this.start) return;
    const key = evt.key;
    if (/^[0-9.,]$/.test(key)) {
      this.dynamicValue += key === ',' ? '.' : key;
      this.ctx.statusMessage = `Digite comprimento e Enter: ${this.dynamicValue}`;
      return;
    }
    if (key === 'Backspace') {
      this.dynamicValue = this.dynamicValue.slice(0, -1);
      return;
    }
    if (key !== 'Enter') return;
    const value = Number(this.dynamicValue);
    if (!Number.isFinite(value) || value <= 0) return;
    const target = this.currentPoint || { x: this.start.x + value, y: this.start.y };
    const dx = target.x - this.start.x;
    const dy = target.y - this.start.y;
    const len = Math.hypot(dx, dy) || 1;
    const end = { x: this.start.x + (dx / len) * value, y: this.start.y + (dy / len) * value };
    this.ctx.addEntity(new LineEntity({ geometry: { x1: this.start.x, y1: this.start.y, x2: end.x, y2: end.y }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.start = end;
    this.dynamicValue = '';
    this.currentPoint = end;
    this.ctx.preview.set([{ type: 'line', from: this.start, to: this.start }]);
  }
  commit() { this.start = null; this.ctx.preview.clear(); this.ctx.prompt.set({ message: 'Linha finalizada' }); }
  cancel() { this.start = null; this.dynamicValue = ''; this.currentPoint = null; this.ctx.preview.clear(); this.ctx.prompt.set({ message: 'Comando linha cancelado' }); }
}
