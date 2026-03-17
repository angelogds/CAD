import { BaseEntity } from './base.entity.js';
export class PolylineEntity extends BaseEntity { constructor(payload = {}) { super({ ...payload, type: 'polyline' }); } }
