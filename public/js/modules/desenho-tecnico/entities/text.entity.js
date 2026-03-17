import { BaseEntity } from './base.entity.js';
export class TextEntity extends BaseEntity { constructor(payload = {}) { super({ ...payload, type: 'text' }); } }
