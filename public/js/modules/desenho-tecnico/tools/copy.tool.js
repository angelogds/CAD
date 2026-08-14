import { BaseTool } from './base.tool.js';

export class CopyTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'copy';
    this.basePoint = null;
  }

  activate() {
    this.basePoint = null;
    this.ctx.prompt.set({ message: this.ctx.selection.ids.size ? 'Copiar: informe o ponto base' : 'Copiar: selecione objetos antes de informar o ponto base' });
  }

  selectedEntities() {
    return this.ctx.state.entities.filter((entity) => this.ctx.selection.includes(entity.id) && this.ctx.isEntityEditable(entity));
  }

  buildCopies(point) {
    if (!this.basePoint) return [];
    const dx = point.x - this.basePoint.x;
    const dy = point.y - this.basePoint.y;
    return this.selectedEntities().map((entity) => {
      const copy = entity.clone();
      copy.id = crypto.randomUUID();
      copy.move(dx, dy);
      return copy;
    });
  }

  onMouseDown(evt) {
    if (!this.ctx.selection.ids.size) {
      const hit = this.ctx.findEntityAt(evt.world);
      if (hit && this.ctx.isEntityEditable(hit)) {
        this.ctx.selection.set([hit.id]);
        this.ctx.prompt.set({ message: 'Copiar: informe o ponto base' });
      }
      return;
    }
    const point = this.ctx.getPoint(evt.world, this.basePoint);
    if (!this.basePoint) {
      this.basePoint = point;
      this.ctx.prompt.set({ message: 'Copiar: informe o ponto de destino' });
      return;
    }
    const copies = this.buildCopies(point);
    if (copies.length) {
      this.ctx.state.entities.push(...copies);
      this.ctx.selection.set(copies.map((copy) => copy.id));
      this.ctx.pushHistory();
      this.ctx.markDirty(`Copiados ${copies.length} objeto(s)`);
    }
    this.basePoint = null;
    this.clearPreview();
    this.ctx.prompt.set({ message: 'Cópia concluída. Informe outro ponto base ou ESC.' });
    this.ctx.render();
  }

  onMouseMove(evt) {
    if (!this.basePoint) return;
    const point = this.ctx.getPoint(evt.world, this.basePoint);
    const dx = point.x - this.basePoint.x;
    const dy = point.y - this.basePoint.y;
    this.setPreview(this.buildCopies(point).map((entity) => ({ type: 'ghost-entity', entity })));
    this.ctx.statusMessage = `Copiar: ΔX ${dx.toFixed(3)} mm | ΔY ${dy.toFixed(3)} mm | Distância ${Math.hypot(dx, dy).toFixed(3)} mm`;
  }

  cancel() {
    this.basePoint = null;
    this.clearPreview();
  }
}
