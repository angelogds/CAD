import { BaseTool } from './base.tool.js';
import { LineEntity } from '../entities/line.entity.js';
import { distance2D } from '../core/geometry.js';

export class LineTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'line';
    this.start = null;
    this.dynamicValue = '';
    this.currentPoint = null;
    this.manualLength = null;
  }

  activate() {
    this.ctx.prompt.set({ message: 'Clique para definir o primeiro ponto' });
    this.ctx.hideDynamicInput?.();
  }

  updatePreview(point) {
    if (!this.start || !point) return;
    this.currentPoint = point;
    const dx = point.x - this.start.x;
    const dy = point.y - this.start.y;
    const length = Math.hypot(dx, dy);
    this.setPreview([
      { type: 'line', from: this.start, to: point },
      ...(this.ctx.getAssistGuides?.(this.start, point) || []),
    ]);
    const typed = this.dynamicValue ? ` | Entrada: ${this.dynamicValue}` : '';
    this.ctx.statusMessage = `Comprimento: ${length.toFixed(2)} mm${typed}`;
    const screen = this.ctx.viewport.worldToScreen(point.x, point.y);
    this.ctx.showDynamicInput?.({
      mode: 'line',
      value: this.dynamicValue || length.toFixed(2),
      x: screen.x + 14,
      y: screen.y - 12,
      onChange: (v) => {
        this.dynamicValue = v;
      },
      onConfirm: (v) => {
        const parsed = Number(v);
        if (!Number.isFinite(parsed) || parsed <= 0) return false;
        this.dynamicValue = String(parsed);
        this.manualLength = parsed;
        this.applyManualLength();
        return true;
      },
      onCancel: () => {
        this.dynamicValue = '';
      },
    });
  }

  applyManualLength() {
    if (!this.start) return;
    const value = Number(this.manualLength || this.dynamicValue);
    if (!Number.isFinite(value) || value <= 0) return;
    const target = this.currentPoint || { x: this.start.x + value, y: this.start.y };
    const dx = target.x - this.start.x;
    const dy = target.y - this.start.y;
    const len = Math.hypot(dx, dy) || 1;
    const end = { x: this.start.x + (dx / len) * value, y: this.start.y + (dy / len) * value };
    this.ctx.addEntity(new LineEntity({ geometry: { x1: this.start.x, y1: this.start.y, x2: end.x, y2: end.y }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.start = end;
    this.currentPoint = end;
    this.dynamicValue = '';
    this.manualLength = null;
    this.setPreview([{ type: 'line', from: this.start, to: this.start }]);
    this.ctx.hideDynamicInput?.();
    this.ctx.prompt.set({ message: 'Linha criada. Clique para continuar ou ESC para finalizar.' });
  }

  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world, this.start);
    if (!this.start) {
      this.start = p;
      this.dynamicValue = '';
      this.manualLength = null;
      this.ctx.prompt.set({ message: 'Clique para definir o segundo ponto ou digite o comprimento' });
      return;
    }
    this.ctx.addEntity(new LineEntity({ geometry: { x1: this.start.x, y1: this.start.y, x2: p.x, y2: p.y }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.dynamicValue = '';
    this.manualLength = null;
    this.start = p;
    this.ctx.hideDynamicInput?.();
  }

  onMouseMove(evt) {
    if (!this.start) return;
    const p = this.ctx.getPoint(evt.world, this.start);
    this.updatePreview(p);
  }

  onKeyDown(evt) {
    if (!this.start) return;
    const key = evt.key;
    if (/^[0-9.,]$/.test(key)) {
      this.dynamicValue += key === ',' ? '.' : key;
      this.manualLength = null;
      this.ctx.statusMessage = `Digite comprimento e Enter: ${this.dynamicValue}`;
      this.updatePreview(this.currentPoint || this.start);
      return;
    }
    if (key === 'Backspace') {
      this.dynamicValue = this.dynamicValue.slice(0, -1);
      this.updatePreview(this.currentPoint || this.start);
      return;
    }
    if (key !== 'Enter') return;
    this.manualLength = Number(this.dynamicValue);
    this.applyManualLength();
  }

  commit() {
    this.start = null;
    this.currentPoint = null;
    this.dynamicValue = '';
    this.manualLength = null;
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
    this.ctx.prompt.set({ message: 'Linha finalizada' });
  }

  cancel() {
    this.start = null;
    this.dynamicValue = '';
    this.currentPoint = null;
    this.manualLength = null;
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
    this.ctx.prompt.set({ message: 'Comando linha cancelado' });
  }
}
