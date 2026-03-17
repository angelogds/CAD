export class SelectionManager {
  constructor(eventBus) { this.eventBus = eventBus; this.ids = new Set(); this.hoverId = null; }
  set(ids = []) { this.ids = new Set(ids); this.eventBus.emit('selection:changed', Array.from(this.ids)); }
  toggle(id) { if (this.ids.has(id)) this.ids.delete(id); else this.ids.add(id); this.eventBus.emit('selection:changed', Array.from(this.ids)); }
  clear() { this.set([]); }
  includes(id) { return this.ids.has(id); }
  setHover(id) { this.hoverId = id || null; this.eventBus.emit('entity:hovered', this.hoverId); }
}
