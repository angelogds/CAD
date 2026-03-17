import { Bounds2D } from '../core/geometry.js';

export class BaseEntity {
  constructor({ id, type, geometry = {}, style = {}, visible = true, selected = false, metadata = {} } = {}) {
    this.id = id || crypto.randomUUID();
    this.type = type || 'entity';
    this.geometry = geometry;
    this.style = style;
    this.visible = visible;
    this.selected = selected;
    this.metadata = metadata;
  }
  getBounds() { return new Bounds2D(); }
  hitTest() { return false; }
  move(dx, dy) { Object.keys(this.geometry).forEach((k) => { if (k.startsWith('x')) this.geometry[k] += dx; if (k.startsWith('y')) this.geometry[k] += dy; }); }
  clone() { return new this.constructor(JSON.parse(JSON.stringify(this.serialize()))); }
  serialize() { return { id: this.id, type: this.type, geometry: this.geometry, style: this.style, visible: this.visible, selected: this.selected, metadata: this.metadata }; }
  static deserialize(payload) { return new this(payload); }
  render() { return ''; }
}
