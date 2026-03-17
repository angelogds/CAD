import { BaseTool } from './base.tool.js';
import { CircleEntity } from '../entities/circle.entity.js';
import { distance2D } from '../core/geometry.js';

export class CircleTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'circle';
    this.center = null;
    this.dynamicValue = '';
    this.currentRadius = 0;
  }

  activate() {
    this.ctx.prompt.set({ message: 'Clique para definir o centro' });
    this.ctx.hideDynamicInput?.();
  }

  updatePreview(radius, point = null) {
    if (!this.center) return;
    this.currentRadius = radius;
    this.setPreview([{ type: 'circle', center: this.center, radius }]);
    const screen = point ? this.ctx.viewport.worldToScreen(point.x, point.y) : this.ctx.viewport.worldToScreen(this.center.x + radius, this.center.y);
    this.ctx.showDynamicInput?.({
      mode: 'circle',
      value: this.dynamicValue || radius.toFixed(2),
      x: screen.x + 14,
      y: screen.y - 12,
      onChange: (v) => { this.dynamicValue = v; },
      onConfirm: (v) => {
        const parsed = Number(v);
        if (!Number.isFinite(parsed) || parsed <= 0) return false;
        this.dynamicValue = String(parsed);
        this.applyRadius(parsed);
        return true;
      },
      onCancel: () => { this.dynamicValue = ''; },
    });
    const typed = this.dynamicValue ? ` | Entrada: ${this.dynamicValue}` : '';
    this.ctx.statusMessage = `Raio: ${radius.toFixed(2)} mm | Diâmetro: ${(radius * 2).toFixed(2)} mm${typed}`;
  }

  applyRadius(radius) {
    if (!this.center || !Number.isFinite(radius) || radius <= 0) return;
    this.ctx.addEntity(new CircleEntity({ geometry: { cx: this.center.x, cy: this.center.y, radius }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.center = null;
    this.dynamicValue = '';
    this.currentRadius = 0;
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
  }

  onMouseDown(evt) {
    const p = this.ctx.getPoint(evt.world);
    if (!this.center) {
      this.center = p;
      this.dynamicValue = '';
      this.ctx.prompt.set({ message: 'Clique para definir o raio ou digite o valor' });
      return;
    }
    this.applyRadius(distance2D(this.center, p));
  }

  onMouseMove(evt) {
    if (!this.center) return;
    const p = this.ctx.getPoint(evt.world);
    this.updatePreview(distance2D(this.center, p), p);
  }

  onKeyDown(evt) {
    if (!this.center) return;
    const key = evt.key;
    if (/^[0-9.,]$/.test(key)) {
      this.dynamicValue += key === ',' ? '.' : key;
      this.ctx.statusMessage = `Digite raio e Enter: ${this.dynamicValue}`;
      const typedRadius = Number(this.dynamicValue);
      if (Number.isFinite(typedRadius) && typedRadius > 0) {
        this.updatePreview(typedRadius);
      }
      return;
    }
    if (key === 'Backspace') {
      this.dynamicValue = this.dynamicValue.slice(0, -1);
      return;
    }
    if (key !== 'Enter') return;
    const radius = Number(this.dynamicValue);
    this.applyRadius(radius);
  }

  cancel() {
    this.center = null;
    this.dynamicValue = '';
    this.currentRadius = 0;
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
  }
}
