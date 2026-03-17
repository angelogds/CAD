import { BaseTool } from './base.tool.js';
export class MeasureTool extends BaseTool { constructor(ctx){ super(ctx); this.name='measure'; } activate(){ this.ctx.prompt.set({message:'Medição: em breve'});} }
