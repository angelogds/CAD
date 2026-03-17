import { BaseTool } from './base.tool.js';
export class DimensionTool extends BaseTool { constructor(ctx){ super(ctx); this.name='dimension'; } activate(){ this.ctx.prompt.set({message:'Cota: em breve'});} }
