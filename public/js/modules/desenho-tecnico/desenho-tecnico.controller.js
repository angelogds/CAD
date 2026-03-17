import { createDesenhoTecnicoState } from './desenho-tecnico.state.js';
import { EventBus } from './interaction/event.bus.js';
import { PreviewLayer } from './interaction/preview.layer.js';
import { SelectionManager } from './interaction/selection.manager.js';
import { PromptManager } from './interaction/prompt.manager.js';
import { ViewportController } from './viewport/viewport.controller.js';
import { InteractionController } from './interaction/interaction.controller.js';
import { DesenhoTecnicoRenderer } from './desenho-tecnico.renderer.js';
import { SelectTool } from './tools/select.tool.js';
import { PanTool } from './tools/pan.tool.js';
import { LineTool } from './tools/line.tool.js';
import { RectTool } from './tools/rect.tool.js';
import { CircleTool } from './tools/circle.tool.js';
import { DimensionTool } from './tools/dimension.tool.js';
import { MeasureTool } from './tools/measure.tool.js';
import { ZoomWindowTool } from './tools/zoom-window.tool.js';
import { LineEntity } from './entities/line.entity.js';

class ToolManager { constructor(){ this.tools=new Map(); this.active=null; this.name='select'; this.aliases={dim_linear:'dimension',dim_diameter:'dimension',dim_angular:'dimension'}; } register(tool){ this.tools.set(tool.name, tool);} set(name){ const resolved=this.aliases[name]||name; this.active?.deactivate?.(); this.active=this.tools.get(resolved)||this.tools.get('select'); this.name=this.active.name; this.active.activate(); } }

export class DesenhoTecnicoController {
  constructor(svg, initial = {}) {
    this.state = createDesenhoTecnicoState();
    this.eventBus = new EventBus();
    this.previewLayer = new PreviewLayer();
    this.selection = new SelectionManager(this.eventBus);
    this.prompt = new PromptManager(this.eventBus);
    this.viewport = new ViewportController(svg, this.eventBus);
    this.renderer = new DesenhoTecnicoRenderer(svg, this.state, this.viewport, this.selection);
    this.statusMessage = '';
    this.toolManager = new ToolManager();
    this.ctx = { state:this.state, viewport:this.viewport, selection:this.selection, preview:this.previewLayer, prompt:this.prompt, addEntity:(e)=>this.addEntity(e), findEntityAt:(w)=>this.findEntityAt(w), toolManager:this.toolManager, get statusMessage(){return this.state.statusMessage;}, set statusMessage(v){this.state.statusMessage=v;} };
    [new SelectTool(this.ctx),new PanTool(this.ctx),new LineTool(this.ctx),new RectTool(this.ctx),new CircleTool(this.ctx),new DimensionTool(this.ctx),new MeasureTool(this.ctx),new ZoomWindowTool(this.ctx)].forEach((t)=>this.toolManager.register(t));
    this.interaction = new InteractionController(svg, this.toolManager, this.viewport, this.eventBus);
    this.loadInitial(initial);
    this.bindUI();
    this.interaction.bind();
    this.toolManager.set('select');
    this.fitInitial();
    this.render();
  }
  loadInitial(initial) { (initial.objects || []).filter((o)=>o.type==='line').forEach((o)=>this.state.entities.push(new LineEntity({id:o.id, geometry:{x1:o.x,y1:o.y,x2:o.x2,y2:o.y2}, style:{stroke:o.stroke}}))); }
  addEntity(entity) { this.state.entities.push(entity); this.eventBus.emit('entity:created', entity); this.render(); }
  findEntityAt(world) { return [...this.state.entities].reverse().find((e)=>e.hitTest(world, 6 / this.viewport.getViewState().zoom)); }
  fitInitial() { const b = this.renderer.getGlobalBounds(); if (b.isValid()) this.viewport.zoomExtents(b); }
  render() {
    this.state.preview = this.previewLayer.items;
    this.state.selection = Array.from(this.selection.ids);
    this.state.hover = this.selection.hoverId;
    this.state.activeTool = this.toolManager.name;
    this.renderer.render();
    this.updateStatus();
  }
  updateStatus(cursor = null) {
    const set = (id,v) => { const el=document.getElementById(id); if (el) el.textContent = v; };
    const zoom = this.viewport.getViewState().zoom;
    set('cadStatusTool', this.state.activeTool);
    set('cadStatusZoom', `${(zoom*100).toFixed(0)}%`);
    if (cursor) { set('cadStatusX', cursor.world.x.toFixed(2)); set('cadStatusY', cursor.world.y.toFixed(2)); }
    const first = this.state.entities.find((e)=>this.selection.includes(e.id));
    set('cadStatusSelected', first?.type || '-');
    const props = document.getElementById('cadProperties');
    if (props) props.innerHTML = first ? `<div class='cad-prop-row'><span class='cad-prop-label'>Tipo</span><span>${first.type}</span></div><div class='cad-prop-row'><span class='cad-prop-label'>ID</span><span>${first.id}</span></div><pre style='font-size:11px;white-space:pre-wrap'>${JSON.stringify(first.geometry, null, 2)}</pre>` : '<p style="color:#94a3b8;font-size:12px;">Selecione um objeto para editar suas propriedades.</p>';
    set('cadStatusMessage', this.state.statusMessage || this.prompt.message || 'Pronto');
  }
  bindUI() {
    window.addEventListener('resize', ()=>{ this.viewport.resize(); this.render(); });
    this.eventBus.on('viewport:changed', ()=>this.render());
    this.eventBus.on('selection:changed', ()=>this.render());
    this.eventBus.on('entity:hovered', ()=>this.render());
    this.eventBus.on('prompt:changed', ()=>this.render());
    this.eventBus.on('cursor:move', (c)=>{ this.updateStatus(c); this.render(); });
    document.querySelectorAll('[data-tool]').forEach((btn)=>btn.addEventListener('click', ()=>{ this.toolManager.set(btn.dataset.tool); this.eventBus.emit('tool:changed', this.toolManager.name); this.render(); }));
    document.getElementById('cadZoomExtentsBtn')?.addEventListener('click', ()=>{ this.viewport.zoomExtents(this.renderer.getGlobalBounds()); });
    document.getElementById('cadResetViewBtn')?.addEventListener('click', ()=>{ this.viewport.resetView(); this.fitInitial(); });
  }
}
