import { BaseTool } from './base.tool.js';

export class MoveTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'move';
    this.basePoint = null;
  }

  activate() {
    this.basePoint = null;
    this.ctx.prompt.set({ message: this.ctx.selection.ids.size ? 'Mover: informe o ponto base' : 'Mover: selecione objetos antes de informar o ponto base' });
  }

  selectedEntities() {
    return this.ctx.state.entities.filter((entity) => this.ctx.selection.includes(entity.id) && this.ctx.isEntityEditable(entity));
  }

  onMouseDown(evt) {
    if (!this.ctx.selection.ids.size) {
      const hit = this.ctx.findEntityAt(evt.world);
      if (hit && this.ctx.isEntityEditable(hit)) {
        this.ctx.selection.set([hit.id]);
        this.ctx.prompt.set({ message: 'Mover: informe o ponto base' });
      }
      return;
    }
    const point = this.ctx.getPoint(evt.world, this.basePoint);
    if (!this.basePoint) {
      this.basePoint = point;
      this.ctx.prompt.set({ message: 'Mover: informe o ponto de destino' });
      return;
    }
    const dx = point.x - this.basePoint.x;
    const dy = point.y - this.basePoint.y;
    const selected = this.selectedEntities();
    selected.forEach((entity) => entity.move(dx, dy));
    if (selected.length) {
      this.ctx.pushHistory();
      this.ctx.markDirty(`Movidos ${selected.length} objeto(s)`);
    }
    this.basePoint = null;
    this.clearPreview();
    this.ctx.prompt.set({ message: 'Movimento concluído. Informe outro ponto base ou ESC.' });
    this.ctx.render();
  }

  onMouseMove(evt) {
    if (!this.basePoint) return;
    const point = this.ctx.getPoint(evt.world, this.basePoint);
    const dx = point.x - this.basePoint.x;
    const dy = point.y - this.basePoint.y;
    const preview = this.selectedEntities().map((entity) => {
      const ghost = entity.clone();
      ghost.move(dx, dy);
      return { type: 'ghost-entity', entity: ghost };
    });
    this.setPreview(preview);
    this.ctx.statusMessage = `Mover: ΔX ${dx.toFixed(3)} mm | ΔY ${dy.toFixed(3)} mm | Distância ${Math.hypot(dx, dy).toFixed(3)} mm`;
  }

  cancel() {
    this.basePoint = null;
    this.clearPreview();
  }
}
