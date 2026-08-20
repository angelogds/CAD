export class SelectionManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.ids = new Set();
    this.hoverId = null;
  }

  emit() {
    this.eventBus.emit('selection:changed', Array.from(this.ids));
  }

  set(ids = []) {
    this.ids = new Set(ids);
    this.emit();
  }

  add(id) {
    if (id == null) return;
    this.ids.add(id);
    this.emit();
  }

  addMany(ids = []) {
    ids.forEach((id) => { if (id != null) this.ids.add(id); });
    this.emit();
  }

  remove(id) {
    this.ids.delete(id);
    this.emit();
  }

  toggle(id) {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    this.emit();
  }

  toggleMany(ids = []) {
    ids.forEach((id) => {
      if (this.ids.has(id)) this.ids.delete(id);
      else this.ids.add(id);
    });
    this.emit();
  }

  clear() {
    this.set([]);
  }

  includes(id) {
    return this.ids.has(id);
  }

  setHover(id) {
    this.hoverId = id || null;
    this.eventBus.emit('entity:hovered', this.hoverId);
  }
}
