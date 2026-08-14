import { BaseTool } from './base.tool.js';

export class EraseTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'erase'; }

  activate() { this.ctx.prompt.set({ message: 'Apagar: clique em um objeto ou use a seleção atual' }); }

  onMouseDown(evt) {
    const hit = this.ctx.findEntityAt(evt.world);
    let ids = [];
    if (hit) ids = this.ctx.selection.includes(hit.id) ? Array.from(this.ctx.selection.ids) : [hit.id];
    else ids = Array.from(this.ctx.selection.ids);
    const editableIds = new Set(ids.filter((id) => {
      const entity = this.ctx.state.entities.find((item) => item.id === id);
      return entity && this.ctx.isEntityEditable(entity);
    }));
    if (!editableIds.size) return;
    this.ctx.state.entities = this.ctx.state.entities.filter((entity) => !editableIds.has(entity.id));
    this.ctx.selection.clear();
    this.ctx.pushHistory();
    this.ctx.markDirty(`Apagados ${editableIds.size} objeto(s)`);
    this.ctx.render();
  }
}
