import { BaseEntity } from './base.entity.js';
export class ArcEntity extends BaseEntity { constructor(payload = {}) { super({ ...payload, type: 'arc' }); } }
