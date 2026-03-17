import { BaseTool } from './base.tool.js';

export class ArcTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'arc'; }
  activate() { this.ctx.prompt.set({ message: 'Arco em desenvolvimento' }); }
}
