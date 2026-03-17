import { BaseTool } from './base.tool.js';

export class ZoomWindowTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'zoom-window'; this.start = null; }
  activate() { this.ctx.prompt.set({ message: 'Defina a janela de zoom com dois pontos' }); }
  onMouseDown(evt) { this.start = evt.world; }
  onMouseMove(evt) { if (!this.start) return; this.ctx.preview.set([{ type: 'selection-box', from: this.start, to: evt.world }]); }
  onMouseUp(evt) {
    if (!this.start) return;
    this.ctx.viewport.zoomWindow(this.start, evt.world);
    this.ctx.preview.clear();
    this.start = null;
    this.ctx.toolManager.set('select');
  }
  cancel() { this.start = null; this.ctx.preview.clear(); }
}
