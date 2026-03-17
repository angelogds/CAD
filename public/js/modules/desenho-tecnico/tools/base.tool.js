export class BaseTool {
  constructor(ctx) { this.ctx = ctx; this.name = 'base'; }
  activate() {}
  deactivate() {}
  onMouseDown() {}
  onMouseMove() {}
  onMouseUp() {}
  onWheel() {}
  onKeyDown(e) { if (e.key === 'Escape') this.cancel(); if (e.key === 'Enter') this.commit(); }
  onKeyUp() {}
  cancel() {}
  commit() {}

  setPreview(items = []) {
    const persistent = (this.ctx.preview.items || []).filter((item) => item.type === 'snap');
    this.ctx.preview.set([...items, ...persistent]);
  }

  clearPreview() {
    this.ctx.preview.set((this.ctx.preview.items || []).filter((item) => item.type === 'snap'));
  }
}
