import { Bounds2D } from '../core/geometry.js';
import { createViewportState } from './viewport.state.js';

export class ViewportController {
  constructor(svg, eventBus) { this.svg = svg; this.eventBus = eventBus; this.state = createViewportState(); this.resize(); }
  resize() { const r = this.svg.getBoundingClientRect(); this.state.width = r.width || 1; this.state.height = r.height || 1; }
  setView(partial = {}) { Object.assign(this.state, partial); this.#emit(); }
  getViewState() { return { ...this.state }; }
  resetView() { this.setView(createViewportState()); this.resize(); }
  pan(dxScreen, dyScreen) { this.state.offsetX += dxScreen; this.state.offsetY += dyScreen; this.#emit(); }
  zoom(factor, screenPoint = null) {
    const prev = this.state.zoom;
    const next = Math.max(this.state.minZoom, Math.min(this.state.maxZoom, prev * factor));
    if (next === prev) return;
    if (screenPoint) {
      const world = this.screenToWorld(screenPoint.x, screenPoint.y);
      this.state.zoom = next;
      const sp = this.worldToScreen(world.x, world.y);
      this.state.offsetX += screenPoint.x - sp.x;
      this.state.offsetY += screenPoint.y - sp.y;
    } else this.state.zoom = next;
    this.#emit();
  }
  zoomWindow(a, b) { const bounds = new Bounds2D(Math.min(a.x,b.x), Math.min(a.y,b.y), Math.max(a.x,b.x), Math.max(a.y,b.y)); this.fitToBounds(bounds); }
  zoomExtents(bounds) { this.fitToBounds(bounds); }
  fitToBounds(bounds) {
    if (!bounds?.isValid()) return;
    this.resize();
    const padding = 40;
    const usableW = Math.max(10, this.state.width - padding * 2);
    const usableH = Math.max(10, this.state.height - padding * 2);
    const zoom = Math.max(this.state.minZoom, Math.min(this.state.maxZoom, Math.min(usableW / Math.max(1, bounds.width()), usableH / Math.max(1, bounds.height()))));
    this.state.zoom = zoom;
    this.centerOnBounds(bounds);
  }
  centerOnBounds(bounds) {
    const c = bounds.center();
    this.state.offsetX = this.state.width / 2 - c.x * this.state.zoom;
    this.state.offsetY = this.state.height / 2 - c.y * this.state.zoom;
    this.#emit();
  }
  worldToScreen(x, y) { return { x: x * this.state.zoom + this.state.offsetX, y: y * this.state.zoom + this.state.offsetY }; }
  screenToWorld(x, y) { return { x: (x - this.state.offsetX) / this.state.zoom, y: (y - this.state.offsetY) / this.state.zoom }; }
  #emit() { this.eventBus.emit('viewport:changed', this.getViewState()); }
}
