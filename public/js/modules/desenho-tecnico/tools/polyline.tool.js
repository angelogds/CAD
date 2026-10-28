import { BaseTool } from './base.tool.js';
import { PolylineEntity } from '../entities/polyline.entity.js';
import { distance2D, isFinitePoint, parseCadPointInput } from '../core/geometry.js';

export class PolylineTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'polyline';
    this.points = [];
    this.dynamicValue = '';
    this.currentPoint = null;
  }

  activate() {
    this.ctx.prompt.set({ message: 'Polilinha: clique ou digite X,Y. Use @ΔX,ΔY ou @distância<ângulo; Enter finaliza, C fecha, U desfaz vértice.' });
    this.ctx.hideDynamicInput?.();
  }

  addPoint(point) {
    const previous = this.points[this.points.length - 1];
    if (!isFinitePoint(point) || (previous && distance2D(previous, point) <= 1e-9)) return false;
    this.points.push({ x: Number(point.x), y: Number(point.y) });
    this.currentPoint = point;
    this.dynamicValue = '';
    this.ctx.hideDynamicInput?.();
    this.updatePreview();
    return true;
  }

  onMouseDown(evt) {
    this.addPoint(this.ctx.getPoint(evt.world, this.points[this.points.length - 1]));
  }

  onMouseMove(evt) {
    this.currentPoint = this.ctx.getPoint(evt.world, this.points[this.points.length - 1]);
    this.updatePreview();
  }

  updatePreview() {
    const last = this.points[this.points.length - 1];
    const end = this.currentPoint;
    const previewPoints = last && end && distance2D(last, end) > 1e-9 ? [...this.points, end] : [...this.points];
    this.setPreview([
      ...(previewPoints.length > 1 ? [{ type: 'polyline', points: previewPoints }] : []),
      ...(last && end ? this.ctx.getAssistGuides?.(last, end) || [] : []),
    ]);
    if (!end || (!last && !this.dynamicValue)) return;
    const screen = this.ctx.viewport.worldToScreen(end.x, end.y);
    const length = last ? distance2D(last, end) : 0;
    this.ctx.showDynamicInput?.({
      mode: 'polyline',
      value: this.dynamicValue || length.toFixed(2),
      x: screen.x + 14,
      y: screen.y - 12,
      onChange: (value) => { this.dynamicValue = value; },
      onConfirm: (value) => this.applyInput(value),
      onCancel: () => { this.dynamicValue = ''; },
    });
  }

  applyInput(value = this.dynamicValue) {
    const text = String(value).trim();
    if (/^c$/i.test(text)) return this.commit(true);
    if (/^u$/i.test(text)) return this.undoVertex();
    const point = parseCadPointInput(text, this.points[this.points.length - 1], this.currentPoint);
    if (!this.addPoint(point)) {
      this.ctx.prompt.set({ message: 'Entrada inválida. Use X,Y, @ΔX,ΔY ou @distância<ângulo, sem repetir o último vértice.' });
      return false;
    }
    this.ctx.prompt.set({ message: 'Vértice adicionado. Enter finaliza, C fecha, U desfaz vértice.' });
    return true;
  }

  undoVertex() {
    if (!this.points.length) return false;
    this.points.pop();
    this.dynamicValue = '';
    this.ctx.hideDynamicInput?.();
    this.updatePreview();
    this.ctx.prompt.set({ message: 'Último vértice removido. Continue a polilinha ou pressione Enter para finalizar.' });
    return true;
  }

  onKeyDown(evt) {
    const key = evt.key;
    if (key === 'Escape') { this.cancel(); return; }
    if (!this.dynamicValue && /^c$/i.test(key)) { evt.preventDefault?.(); this.commit(true); return; }
    if (!this.dynamicValue && /^u$/i.test(key)) { evt.preventDefault?.(); this.undoVertex(); return; }
    if (/^[0-9.,;@<+\-]$/.test(key)) {
      evt.preventDefault?.();
      this.dynamicValue += key;
      this.updatePreview();
    } else if (key === 'Backspace') {
      evt.preventDefault?.();
      if (!this.dynamicValue) { this.undoVertex(); return; }
      this.dynamicValue = this.dynamicValue.slice(0, -1);
      this.updatePreview();
    } else if (key === 'Enter') {
      evt.preventDefault?.();
      if (this.dynamicValue) this.applyInput();
      else this.commit();
    }
  }

  onDblClick() { this.commit(); }

  commit(closed = false) {
    const points = this.points.map((point) => ({ ...point }));
    if (points.length > 2 && distance2D(points[0], points[points.length - 1]) <= 1e-9 && (closed || points.length > 3)) {
      points.pop();
      closed = true;
    }
    if (points.length < (closed ? 3 : 2)) {
      this.ctx.prompt.set({ message: closed ? 'São necessários três vértices para fechar a polilinha.' : 'Defina pelo menos dois vértices para finalizar.' });
      return false;
    }
    this.ctx.addEntity(new PolylineEntity({ geometry: { points, closed }, metadata: { layer: this.ctx.state.activeLayer } }));
    this.reset();
    this.ctx.prompt.set({ message: closed ? 'Polilinha fechada' : 'Polilinha finalizada' });
    return true;
  }

  reset() {
    this.points = [];
    this.dynamicValue = '';
    this.currentPoint = null;
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
  }

  cancel() { this.reset(); this.ctx.prompt.set({ message: 'Polilinha cancelada' }); }
}
