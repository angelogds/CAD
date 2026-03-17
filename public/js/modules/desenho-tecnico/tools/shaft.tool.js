import { BaseTool } from './base.tool.js';
import { PolylineEntity } from '../entities/polyline.entity.js';

export class ShaftTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'shaft'; this.base = null; this.segments = []; }
  activate() { this.ctx.prompt.set({ message: 'Eixo: clique base inicial. Enter finaliza.' }); }
  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world, this.base || null);
    if (!this.base) { this.base = p; this.segments = [p]; return; }
    const length = Number(window.prompt('Comprimento do trecho', '40') || 0);
    const diameter = Number(window.prompt('Diâmetro do trecho', '20') || 0);
    if (!Number.isFinite(length) || length <= 0) return;
    const next = { x: this.base.x + length, y: this.base.y };
    this.segments.push(next);
    this.base = next;
    this.ctx.preview.set([{ type: 'polyline', points: this.segments }]);
    this.ctx.state.statusMessage = `Trecho adicionado: L=${length}, Ø=${diameter}`;
  }
  commit() {
    if (this.segments.length > 1) {
      this.ctx.addEntity(new PolylineEntity({ geometry: { points: [...this.segments] }, metadata: { layer: 'geometria_principal', shaft: true } }));
    }
    this.base = null;
    this.segments = [];
    this.ctx.preview.clear();
  }
  cancel() { this.base = null; this.segments = []; this.ctx.preview.clear(); }
}
