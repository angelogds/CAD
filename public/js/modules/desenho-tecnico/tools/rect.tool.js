import { BaseTool } from './base.tool.js';
export class RectTool extends BaseTool { constructor(ctx){ super(ctx); this.name='rect'; } activate(){ this.ctx.prompt.set({message:'Retângulo: em breve'});} }
