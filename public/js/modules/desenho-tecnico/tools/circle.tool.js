import { BaseTool } from './base.tool.js';
export class CircleTool extends BaseTool { constructor(ctx){ super(ctx); this.name='circle'; } activate(){ this.ctx.prompt.set({message:'Círculo: em breve'});} }
