import { BaseTool } from './base.tool.js';
export class PanTool extends BaseTool { constructor(ctx) { super(ctx); this.name = 'pan'; } activate() { this.ctx.prompt.set({ message: 'Arraste para mover a vista' }); } }
