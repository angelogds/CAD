import { BaseTool } from './base.tool.js';
import { cloneEntityForMirror } from './modify.utils.js';

export class MirrorTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'mirror'; this.axisA = null; this.axisB = null; }
  activate() { this.ctx.prompt.set({ message: 'Espelhar: selecione entidades, depois defina eixo por 2 pontos' }); }
  onMouseDown(evt) {
    if (!this.ctx.selection.ids.size) return;
    const p = this.ctx.getPoint(evt.world, this.axisA);
    if (!this.axisA) { this.axisA = p; return; }
    this.axisB = p;
    const copies = this.ctx.state.entities
      .filter((e) => this.ctx.selection.includes(e.id))
      .map((e) => cloneEntityForMirror(e, this.axisA, this.axisB));
    copies.forEach((c) => this.ctx.state.entities.push(c));
    this.ctx.pushHistory();
    this.ctx.preview.clear();
    this.axisA = null; this.axisB = null;
    this.ctx.markDirty('Espelhamento concluído');
    this.ctx.render();
  }
  onMouseMove(evt) {
    if (!this.axisA || !this.ctx.selection.ids.size) return;
    const b = this.ctx.getPoint(evt.world, this.axisA);
    const previews = [{ type: 'line', from: this.axisA, to: b }];
    this.ctx.state.entities.filter((e) => this.ctx.selection.includes(e.id)).forEach((e) => previews.push({ type: 'ghost-entity', entity: cloneEntityForMirror(e, this.axisA, b) }));
    this.ctx.preview.set(previews);
  }
  cancel() { this.axisA = null; this.axisB = null; this.ctx.preview.clear(); }
}
