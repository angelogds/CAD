import { BaseTool } from './base.tool.js';
import { RectEntity } from '../entities/rect.entity.js';

function parseRectInput(raw = '') {
  const text = String(raw).trim().toLowerCase().replace(/,/g, '.');
  if (!text) return null;
  const parts = text.split(/[x; ]+/).filter(Boolean);
  if (!parts.length) return null;
  const w = Number(parts[0]);
  const h = Number(parts[1] ?? parts[0]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}

export class RectTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'rect';
    this.start = null;
    this.current = null;
    this.dynamicValue = '';
  }

  activate() {
    this.ctx.prompt.set({ message: 'Clique para definir o primeiro canto' });
    this.ctx.hideDynamicInput?.();
  }

  getPreviewRect(point) {
    if (!this.start || !point) return null;
    const width = point.x - this.start.x;
    const height = point.y - this.start.y;
    return { x: this.start.x, y: this.start.y, width, height };
  }

  applyFromInput(raw) {
    if (!this.start) return false;
    const parsed = parseRectInput(raw || this.dynamicValue);
    if (!parsed) return false;
    const target = this.current || { x: this.start.x + parsed.width, y: this.start.y + parsed.height };
    const signX = (target.x - this.start.x) >= 0 ? 1 : -1;
    const signY = (target.y - this.start.y) >= 0 ? 1 : -1;
    const width = parsed.width * signX;
    const height = parsed.height * signY;
    this.ctx.addEntity(new RectEntity({
      geometry: { x: this.start.x, y: this.start.y, width, height },
      metadata: { layer: this.ctx.state.activeLayer },
    }));
    this.start = null;
    this.current = null;
    this.dynamicValue = '';
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
    this.ctx.prompt.set({ message: 'Retângulo criado' });
    return true;
  }

  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world);
    if (!this.start) {
      this.start = p;
      this.dynamicValue = '';
      this.ctx.prompt.set({ message: 'Defina o canto oposto ou digite largura x altura' });
      return;
    }
    this.current = p;
    this.applyFromInput(`${Math.abs(p.x - this.start.x).toFixed(2)}x${Math.abs(p.y - this.start.y).toFixed(2)}`);
  }

  onMouseMove(evt) {
    if (!this.start) return;
    const p = this.ctx.getPoint(evt.world);
    this.current = p;
    const rect = this.getPreviewRect(p);
    if (!rect) return;
    this.setPreview([{ type: 'rect', from: this.start, to: p, showMeasures: true }]);
    const width = Math.abs(rect.width);
    const height = Math.abs(rect.height);
    const screen = this.ctx.viewport.worldToScreen(p.x, p.y);
    this.ctx.showDynamicInput?.({
      mode: 'rect',
      value: this.dynamicValue || `${width.toFixed(2)}x${height.toFixed(2)}`,
      x: screen.x + 12,
      y: screen.y - 10,
      onChange: (v) => { this.dynamicValue = v; },
      onConfirm: (v) => this.applyFromInput(v),
      onCancel: () => { this.dynamicValue = ''; },
    });
    this.ctx.statusMessage = `Retângulo: L ${width.toFixed(2)} mm × A ${height.toFixed(2)} mm${this.dynamicValue ? ` | Entrada: ${this.dynamicValue}` : ''}`;
  }

  onKeyDown(evt) {
    if (!this.start) return;
    const key = evt.key;
    if (/^[0-9.,xX; ]$/.test(key)) {
      this.dynamicValue += key === 'X' ? 'x' : key;
      return;
    }
    if (key === 'Backspace') {
      this.dynamicValue = this.dynamicValue.slice(0, -1);
      return;
    }
    if (key === 'Enter') this.applyFromInput(this.dynamicValue);
    if (key === 'Escape') this.cancel();
  }

  cancel() {
    this.start = null;
    this.current = null;
    this.dynamicValue = '';
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
  }
}
