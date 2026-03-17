import { BaseEntity } from './base.entity.js';
export class DimensionEntity extends BaseEntity { constructor(payload = {}) { super({ ...payload, type: 'dimension' }); } }
