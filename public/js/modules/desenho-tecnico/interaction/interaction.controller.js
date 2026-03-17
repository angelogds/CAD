export class InteractionController {
  constructor(svg, toolManager, viewport, eventBus) {
    this.svg = svg; this.toolManager = toolManager; this.viewport = viewport; this.eventBus = eventBus; this.dragState = null;
  }
  bind() {
    this.svg.addEventListener('mousedown', (e) => this.#onMouseDown(e));
    this.svg.addEventListener('mousemove', (e) => this.#onMouseMove(e));
    this.svg.addEventListener('mouseup', (e) => this.#onMouseUp(e));
    this.svg.addEventListener('click', (e) => this.toolManager.active?.onClick?.(this.#evt(e)));
    this.svg.addEventListener('dblclick', (e) => this.toolManager.active?.onDblClick?.(this.#evt(e)));
    this.svg.addEventListener('wheel', (e) => this.#onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.toolManager.active?.onKeyDown?.(e));
    window.addEventListener('keyup', (e) => this.toolManager.active?.onKeyUp?.(e));
  }
  #evt(e) {
    const rect = this.svg.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = this.viewport.screenToWorld(screen.x, screen.y);
    this.eventBus.emit('cursor:move', { screen, world });
    return { original: e, screen, world, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey };
  }
  #onMouseDown(e) { if (e.button === 1 || this.toolManager.name === 'pan') this.dragState = this.#evt(e); this.toolManager.active?.onMouseDown?.(this.#evt(e)); }
  #onMouseMove(e) {
    const evt = this.#evt(e);
    if (this.dragState && (e.buttons & 4 || this.toolManager.name === 'pan')) {
      const dx = evt.screen.x - this.dragState.screen.x; const dy = evt.screen.y - this.dragState.screen.y;
      this.viewport.pan(dx, dy); this.dragState = evt;
    }
    this.toolManager.active?.onMouseMove?.(evt);
  }
  #onMouseUp(e) { this.dragState = null; this.toolManager.active?.onMouseUp?.(this.#evt(e)); }
  #onWheel(e) { e.preventDefault(); this.viewport.zoom(e.deltaY < 0 ? 1.1 : 0.9, this.#evt(e).screen); this.toolManager.active?.onWheel?.(this.#evt(e)); }
}
