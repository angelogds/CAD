export class InteractionController {
  constructor(svg, toolManager, viewport, eventBus) {
    this.svg = svg;
    this.toolManager = toolManager;
    this.viewport = viewport;
    this.eventBus = eventBus;
    this.dragState = null;
    this.spacePan = false;
    this.suppressClick = false;
  }

  bind() {
    this.svg.addEventListener('mousedown', (e) => this.#onMouseDown(e));
    this.svg.addEventListener('mousemove', (e) => this.#onMouseMove(e));
    this.svg.addEventListener('mouseup', (e) => this.#onMouseUp(e));
    this.svg.addEventListener('click', (e) => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      this.toolManager.active?.onClick?.(this.#evt(e));
    });
    this.svg.addEventListener('dblclick', (e) => this.toolManager.active?.onDblClick?.(this.#evt(e)));
    this.svg.addEventListener('wheel', (e) => this.#onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) {
        this.spacePan = true;
        e.preventDefault();
      }
      this.toolManager.active?.onKeyDown?.(e);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { this.spacePan = false; this.dragState = null; }
      this.toolManager.active?.onKeyUp?.(e);
    });
    window.addEventListener('blur', () => { this.spacePan = false; this.dragState = null; });
  }

  #screenFromEvent(e) {
    const rect = this.svg.getBoundingClientRect();
    const scaleX = rect.width ? this.viewport.getViewState().width / rect.width : 1;
    const scaleY = rect.height ? this.viewport.getViewState().height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  #evt(e) {
    const screen = this.#screenFromEvent(e);
    const world = this.viewport.screenToWorld(screen.x, screen.y);
    this.eventBus.emit('cursor:move', { screen, world });
    return { original: e, screen, world, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey };
  }

  #onMouseDown(e) {
    if (e.button === 1 || this.spacePan || this.toolManager.name === 'pan') {
      e.preventDefault();
      this.dragState = this.#evt(e);
      return;
    }
    this.toolManager.active?.onMouseDown?.(this.#evt(e));
  }

  #onMouseMove(e) {
    const evt = this.#evt(e);
    if (this.dragState && (e.buttons & 4 || (e.buttons & 1 && (this.spacePan || this.toolManager.name === 'pan')))) {
      const dx = evt.screen.x - this.dragState.screen.x;
      const dy = evt.screen.y - this.dragState.screen.y;
      this.viewport.pan(dx, dy);
      this.dragState = evt;
      this.suppressClick = true;
      return;
    }
    this.toolManager.active?.onMouseMove?.(evt);
  }

  #onMouseUp(e) {
    const wasPanning = Boolean(this.dragState);
    this.dragState = null;
    if (wasPanning) return;
    this.toolManager.active?.onMouseUp?.(this.#evt(e));
  }

  #onWheel(e) {
    e.preventDefault();
    const evt = this.#evt(e);
    this.viewport.zoom(Math.exp(-e.deltaY * 0.0015), evt.screen);
    this.toolManager.active?.onWheel?.(evt);
  }
}
