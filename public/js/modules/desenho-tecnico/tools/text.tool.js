import { BaseTool } from './base.tool.js';
import { TextEntity } from '../entities/text.entity.js';

export class TextTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'text'; }
  activate() { this.ctx.prompt.set({ message: 'Clique para posicionar o texto técnico' }); }
  onMouseDown(evt) {
    const content = window.prompt('Texto técnico:', 'NOTA');
    if (content == null) return;
    this.ctx.addEntity(new TextEntity({ geometry: { x: evt.world.x, y: evt.world.y, text: content, size: 14 }, metadata: { layer: this.ctx.state.activeLayer } }));
  }
}
