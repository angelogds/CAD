export class EventBus {
  constructor() { this.listeners = new Map(); }
  on(event, fn) { const arr = this.listeners.get(event) || []; arr.push(fn); this.listeners.set(event, arr); return () => this.off(event, fn); }
  off(event, fn) { const arr = this.listeners.get(event) || []; this.listeners.set(event, arr.filter((l) => l !== fn)); }
  emit(event, payload) { (this.listeners.get(event) || []).forEach((fn) => fn(payload)); }
}
