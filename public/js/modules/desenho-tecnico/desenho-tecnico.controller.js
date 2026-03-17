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
import { PolylineTool } from './tools/polyline.tool.js';
import { TextTool } from './tools/text.tool.js';
import { CenterlineTool } from './tools/centerline.tool.js';
import { ShaftTool } from './tools/shaft.tool.js';
import { ArcTool } from './tools/arc.tool.js';
import { TrimTool } from './tools/trim.tool.js';
import { ExtendTool } from './tools/extend.tool.js';
import { OffsetTool } from './tools/offset.tool.js';
import { MirrorTool } from './tools/mirror.tool.js';
import { LineEntity } from './entities/line.entity.js';
import { RectEntity } from './entities/rect.entity.js';
import { CircleEntity } from './entities/circle.entity.js';
import { PolylineEntity } from './entities/polyline.entity.js';
import { TextEntity } from './entities/text.entity.js';
import { DimensionEntity } from './entities/dimension.entity.js';
import { ArcEntity } from './entities/arc.entity.js';
import { ShaftEntity } from './entities/shaft.entity.js';

class ToolManager {
  constructor(state) { this.tools = new Map(); this.active = null; this.name = 'select'; this.state = state; }
  register(tool) { this.tools.set(tool.name, tool); }
  set(name) {
    const resolve = { dim_linear: 'dimension', dim_diameter: 'dimension', dim_angular: 'dimension' };
    const mode = name.replace('dim_', '');
    if (name.startsWith('dim_')) this.state.dimensionMode = mode;
    this.active?.deactivate?.();
    this.active = this.tools.get(resolve[name] || name) || this.tools.get('select');
    this.name = this.active.name;
    this.active.activate();
  }
}

const TOOL_LABELS = {
  select: 'Selecionar',
  pan: 'Pan',
  line: 'Linha',
  polyline: 'Polilinha',
  rect: 'Retângulo',
  circle: 'Círculo',
  arc: 'Arco',
  text: 'Texto',
  shaft: 'Eixo Paramétrico',
  centerline: 'Linha de Centro',
  dim_linear: 'Cota Linear',
  dim_diameter: 'Cota Diâmetro',
  dim_angular: 'Cota Angular',
  dimension: 'Cotas',
  'zoom-window': 'Zoom Janela',
  'zoom_window': 'Zoom Janela',
  measure: 'Medição',
  trim: 'Trim',
  extend: 'Extend',
  offset: 'Offset',
  mirror: 'Mirror',
  erase: 'Apagar',
  copy: 'Copy',
  move: 'Move',
};

const TOOL_HINTS = {
  line: 'desenhar segmento',
  polyline: 'desenhar sequência de segmentos',
  circle: 'desenhar por centro e raio',
  arc: 'desenhar arco técnico',
  text: 'inserir anotação técnica',
  shaft: 'gerar eixo mecânico paramétrico',
  centerline: 'marcar eixo de simetria',
  dim_linear: 'cotar distância linear',
};

export class DesenhoTecnicoController {
  constructor(svg, initial = {}) {
    this.state = createDesenhoTecnicoState();
    this.eventBus = new EventBus();
    this.previewLayer = new PreviewLayer();
    this.selection = new SelectionManager(this.eventBus);
    this.prompt = new PromptManager(this.eventBus);
    this.viewport = new ViewportController(svg, this.eventBus);
    this.renderer = new DesenhoTecnicoRenderer(svg, this.state, this.viewport, this.selection);
    this.undoStack = [];
    this.redoStack = [];
    this.initial = initial;
    this.toolManager = new ToolManager(this.state);
    this.isUiBound = false;
    this.ctx = {
      state: this.state,
      viewport: this.viewport,
      selection: this.selection,
      preview: this.previewLayer,
      prompt: this.prompt,
      addEntity: (e) => this.addEntity(e),
      findEntityAt: (w) => this.findEntityAt(w),
      toolManager: this.toolManager,
      markDirty: (msg) => this.markDirty(msg),
      pushHistory: () => this.pushHistory(),
      render: () => this.render(),
      get statusMessage() { return this.state.statusMessage; },
      set statusMessage(v) { this.state.statusMessage = v; },
      getPoint: (point, from = null) => this.getPoint(point, from),
    };
    [
      new SelectTool(this.ctx), new PanTool(this.ctx), new LineTool(this.ctx), new PolylineTool(this.ctx), new RectTool(this.ctx), new CircleTool(this.ctx), new ArcTool(this.ctx), new TextTool(this.ctx),
      new CenterlineTool(this.ctx), new ShaftTool(this.ctx), new DimensionTool(this.ctx), new MeasureTool(this.ctx), new ZoomWindowTool(this.ctx),
      new TrimTool(this.ctx), new ExtendTool(this.ctx), new OffsetTool(this.ctx), new MirrorTool(this.ctx),
    ].forEach((t) => this.toolManager.register(t));
    this.interaction = new InteractionController(svg, this.toolManager, this.viewport, this.eventBus);
    this.loadInitial(initial);
    this.bindUI();
    this.interaction.bind();
    this.toolManager.set(initial.activeTool || 'select');
    this.fitInitial();
    if (initial.viewport) this.viewport.setView(initial.viewport);
    this.pushHistory();
    this.render();
  }

  loadInitial(initial) {
    this.state.activeLayer = initial.activeLayer || 'geometria_principal';
    this.state.layers = initial.layers || {};
    this.ensureDefaultLayers();
    this.state.gridConfig.visible = initial.showGrid !== false;
    this.state.gridConfig.step = initial.gridStep || 20;
    this.state.snappingConfig = { ...this.state.snappingConfig, ...(initial.snappingConfig || {}), enabled: initial.snapEnabled !== false };
    this.state.orthoEnabled = Boolean(initial.orthoEnabled);
    this.state.metadata = {
      codigo: initial.codigo || '', titulo: initial.titulo || '', material: initial.material || '', equipamento_id: initial.equipamento_id || '', observacoes: initial.observacoes || '',
    };
    const map = {
      line: (o) => new LineEntity({ id: o.id, type: o.type, geometry: { x1: o.x, y1: o.y, x2: o.x2, y2: o.y2 }, metadata: { layer: o.layer } }),
      centerline: (o) => new LineEntity({ id: o.id, type: 'centerline', geometry: { x1: o.x, y1: o.y, x2: o.x2, y2: o.y2 }, metadata: { layer: o.layer }, style: { stroke: '#93c5fd' } }),
      rect: (o) => new RectEntity({ id: o.id, geometry: { x: o.x, y: o.y, width: o.width, height: o.height }, metadata: { layer: o.layer } }),
      circle: (o) => new CircleEntity({ id: o.id, geometry: { cx: o.x, cy: o.y, radius: o.radius }, metadata: { layer: o.layer } }),
      polyline: (o) => new PolylineEntity({ id: o.id, geometry: { points: o.points || [] }, metadata: { layer: o.layer, ...(o.metadata || {}) } }),
      text: (o) => new TextEntity({ id: o.id, geometry: { x: o.x, y: o.y, text: o.text, size: o.size || 14 }, metadata: { layer: o.layer } }),
      dimension: (o) => new DimensionEntity({ id: o.id, geometry: o.geometry || {}, metadata: { layer: o.layer || 'cotas' } }),
      arc: (o) => new ArcEntity({ id: o.id, geometry: o.geometry || { cx: o.cx, cy: o.cy, radius: o.radius, startAngle: o.startAngle, endAngle: o.endAngle, ccw: o.ccw !== false }, metadata: { layer: o.layer } }),
      shaft: (o) => new ShaftEntity({ id: o.id, geometry: o.geometry || {}, metadata: { layer: o.layer } }),
    };
    (initial.objects || []).forEach((o) => { if (map[o.type]) this.state.entities.push(map[o.type](o)); });
    (initial.dimensions || []).forEach((d) => this.state.entities.push(new DimensionEntity({ ...d, metadata: { layer: 'cotas' } })));
  }

  serialize() {
    const objects = this.state.entities.map((e) => {
      const layer = e.metadata?.layer || this.state.activeLayer;
      if (e.type === 'line' || e.type === 'centerline') return { id: e.id, type: e.type, x: e.geometry.x1, y: e.geometry.y1, x2: e.geometry.x2, y2: e.geometry.y2, layer };
      if (e.type === 'rect') return { id: e.id, type: 'rect', x: e.geometry.x, y: e.geometry.y, width: e.geometry.width, height: e.geometry.height, layer };
      if (e.type === 'circle') return { id: e.id, type: 'circle', x: e.geometry.cx, y: e.geometry.cy, radius: e.geometry.radius, layer };
      if (e.type === 'polyline') return { id: e.id, type: 'polyline', points: e.geometry.points, layer, metadata: e.metadata || {} };
      if (e.type === 'text') return { id: e.id, type: 'text', x: e.geometry.x, y: e.geometry.y, text: e.geometry.text, size: e.geometry.size, layer };
      if (e.type === 'dimension') return { id: e.id, type: 'dimension', geometry: e.geometry, layer };
      if (e.type === 'arc') return { id: e.id, type: 'arc', geometry: e.geometry, layer };
      if (e.type === 'shaft') return { id: e.id, type: 'shaft', geometry: e.geometry, layer };
      return { id: e.id, type: e.type, layer };
    });
    return {
      schemaVersion: 2,
      ...this.state.metadata,
      activeTool: this.toolManager.name,
      activeLayer: this.state.activeLayer,
      showGrid: this.state.gridConfig.visible,
      snapEnabled: this.state.snappingConfig.enabled,
      snappingConfig: this.state.snappingConfig,
      orthoEnabled: this.state.orthoEnabled,
      gridStep: this.state.gridConfig.step,
      layers: this.state.layers,
      objects,
      dimensions: objects.filter((o) => o.type === 'dimension'),
      viewport: this.viewport.getViewState(),
    };
  }

  pushHistory() {
    this.undoStack.push(JSON.stringify(this.serialize()));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  markDirty(msg = 'Editado') { this.state.statusMessage = msg; this.scheduleAutosave(); }

  applySerialized(raw) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    this.state.entities = [];
    this.loadInitial(parsed);
    this.render();
  }

  addEntity(entity) { this.state.entities.push(entity); this.pushHistory(); this.markDirty('Entidade criada'); this.eventBus.emit('entity:created', entity); this.render(); }

  getSnapCandidates() {
    const points = [];
    const segments = [];
    const asPoint = (x, y, kind) => points.push({ x, y, kind });
    this.state.entities.forEach((e) => {
      if (e.type === 'line' || e.type === 'centerline') {
        asPoint(e.geometry.x1, e.geometry.y1, 'endpoint');
        asPoint(e.geometry.x2, e.geometry.y2, 'endpoint');
        asPoint((e.geometry.x1 + e.geometry.x2) / 2, (e.geometry.y1 + e.geometry.y2) / 2, 'midpoint');
        segments.push([{ x: e.geometry.x1, y: e.geometry.y1 }, { x: e.geometry.x2, y: e.geometry.y2 }]);
      }
      if (e.type === 'rect') {
        asPoint(e.geometry.x, e.geometry.y, 'endpoint');
        asPoint(e.geometry.x + e.geometry.width, e.geometry.y + e.geometry.height, 'endpoint');
      }
      if (e.type === 'circle') asPoint(e.geometry.cx, e.geometry.cy, 'center');
      if (e.type === 'arc') {
        asPoint(e.geometry.cx, e.geometry.cy, 'center');
        const a0 = e.geometry.startAngle || 0;
        const a1 = e.geometry.endAngle || 0;
        const mid = (a0 + a1) / 2;
        asPoint(e.geometry.cx + Math.cos(mid) * e.geometry.radius, e.geometry.cy + Math.sin(mid) * e.geometry.radius, 'arc-midpoint');
      }
      if (e.type === 'polyline') (e.geometry.points || []).forEach((pt, idx, arr) => {
        asPoint(pt.x, pt.y, 'endpoint');
        if (idx < arr.length - 1) {
          asPoint((pt.x + arr[idx + 1].x) / 2, (pt.y + arr[idx + 1].y) / 2, 'midpoint');
          segments.push([pt, arr[idx + 1]]);
        }
      });
    });
    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        const hit = this.segmentIntersection(segments[i][0], segments[i][1], segments[j][0], segments[j][1]);
        if (hit) asPoint(hit.x, hit.y, 'intersection');
      }
    }
    return points;
  }

  getNearestPointOnEntity(entity, point) {
    const g = entity.geometry || {};
    if (entity.type === 'line' || entity.type === 'centerline') {
      const ax = g.x1; const ay = g.y1; const bx = g.x2; const by = g.y2;
      const dx = bx - ax; const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / len2));
      return { x: ax + t * dx, y: ay + t * dy, kind: 'nearest' };
    }
    if (entity.type === 'circle') {
      const a = Math.atan2(point.y - g.cy, point.x - g.cx);
      return { x: g.cx + Math.cos(a) * g.radius, y: g.cy + Math.sin(a) * g.radius, kind: 'nearest' };
    }
    return null;
  }

  segmentIntersection(p1, p2, p3, p4) {
    const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(den) < 1e-9) return null;
    const x = ((p1.x * p2.y - p1.y * p2.x) * (p3.x - p4.x) - (p1.x - p2.x) * (p3.x * p4.y - p3.y * p4.x)) / den;
    const y = ((p1.x * p2.y - p1.y * p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x * p4.y - p3.y * p4.x)) / den;
    const inside = (p, a, b) => p >= Math.min(a, b) - 1e-6 && p <= Math.max(a, b) + 1e-6;
    if (!inside(x, p1.x, p2.x) || !inside(y, p1.y, p2.y) || !inside(x, p3.x, p4.x) || !inside(y, p3.y, p4.y)) return null;
    return { x, y };
  }

  getPoint(point, from = null) {
    let p = { ...point };
    if (this.state.orthoEnabled && from) {
      const dx = Math.abs(point.x - from.x); const dy = Math.abs(point.y - from.y);
      p = dx >= dy ? { x: point.x, y: from.y } : { x: from.x, y: point.y };
    }
    if (!this.state.snappingConfig.enabled) return p;
    const tol = 10 / this.viewport.getViewState().zoom;
    const cfg = this.state.snappingConfig || {};
    const priority = { endpoint: 1, midpoint: 2, intersection: 3, center: 4, nearest: 5, grid: 6 };
    const candidates = this.getSnapCandidates().filter((c) => cfg[c.kind] !== false);
    if (cfg.nearest !== false) {
      this.state.entities.forEach((e) => {
        const n = this.getNearestPointOnEntity(e, p);
        if (n) candidates.push(n);
      });
    }
    if (cfg.grid !== false) {
      const step = Math.max(0.1, this.state.gridConfig.step || 20);
      candidates.push({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step, kind: 'grid' });
    }
    const nearest = candidates
      .map((c) => ({ ...c, d: Math.hypot(c.x - p.x, c.y - p.y) }))
      .filter((c) => c.d <= tol)
      .sort((a, b) => (priority[a.kind] || 99) - (priority[b.kind] || 99) || a.d - b.d)[0];
    if (nearest) {
      this.state.snappingConfig.activeKind = nearest.kind;
      this.previewLayer.set([...this.previewLayer.items.filter((i) => i.type !== 'snap'), { type: 'snap', point: nearest, kind: nearest.kind }]);
      return { x: nearest.x, y: nearest.y };
    }
    this.state.snappingConfig.activeKind = null;
    this.previewLayer.set(this.previewLayer.items.filter((i) => i.type !== 'snap'));
    return p;
  }

  findEntityAt(world) { return [...this.state.entities].reverse().find((e) => e.hitTest(world, 6 / this.viewport.getViewState().zoom)); }

  fitInitial() { const b = this.renderer.getGlobalBounds(); if (b.isValid()) this.viewport.zoomExtents(b); }

  getToolLabel(name) {
    return TOOL_LABELS[name] || TOOL_LABELS[`dim_${name}`] || name;
  }

  render() {
    this.state.preview = this.previewLayer.items;
    this.state.selection = Array.from(this.selection.ids);
    this.state.hover = this.selection.hoverId;
    this.state.activeTool = this.toolManager.name;
    this.state.grips = this.toolManager.active?.getGrips?.() || [];
    this.renderer.render();
    this.renderLayersPanel();
    this.updateStatus();
    this.syncToolbarState();
  }

  updateStatus(cursor = null) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const zoom = this.viewport.getViewState().zoom;
    set('cadStatusTool', `Ferramenta: ${this.getToolLabel(this.state.activeTool)}`);
    set('cadStatusZoom', `Zoom: ${(zoom * 100).toFixed(0)}%`);
    if (cursor) { set('cadStatusX', `X: ${cursor.world.x.toFixed(2)}`); set('cadStatusY', `Y: ${cursor.world.y.toFixed(2)}`); }
    const first = this.state.entities.find((e) => this.selection.includes(e.id));
    set('cadStatusSelected', `Selecionado: ${first?.type || '-'} • Layer: ${this.state.activeLayer} • Snap: ${this.state.snappingConfig.activeKind || (this.state.snappingConfig.enabled ? 'on' : 'off')} • Unidade: ${this.state.metadata?.unidade || 'mm'}`);
    this.renderProperties(first);
    set('cadStatusMessage', this.state.statusMessage || this.prompt.message || 'Pronto');
  }

  renderProperties(entity) {
    const props = document.getElementById('cadProperties');
    if (!props) return;
    if (!entity) {
      props.innerHTML = '<p style="color:#94a3b8;font-size:12px;">Selecione um objeto para editar suas propriedades.</p>';
      return;
    }
    const layer = entity.metadata?.layer || this.state.activeLayer;
    const geo = entity.geometry;
    const input = (id, label, value, type = 'text') => `<div class='cad-prop-row'><span class='cad-prop-label'>${label}</span><input class='cad-input' data-prop='${id}' type='${type}' value='${value}'/></div>`;
    const readOnly = (label, value) => `<div class='cad-prop-row'><span class='cad-prop-label'>${label}</span><span>${value}</span></div>`;
    let details = '';
    if (entity.type === 'line' || entity.type === 'centerline') {
      const dx = (geo.x2 || 0) - (geo.x1 || 0);
      const dy = (geo.y2 || 0) - (geo.y1 || 0);
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      details += input('x1', 'Início X', geo.x1, 'number') + input('y1', 'Início Y', geo.y1, 'number');
      details += input('x2', 'Fim X', geo.x2, 'number') + input('y2', 'Fim Y', geo.y2, 'number');
      details += input('length', 'Comprimento', len.toFixed(2), 'number');
      details += input('angle', 'Ângulo (°)', angle.toFixed(2), 'number');
    } else if (entity.type === 'polyline') {
      const points = geo.points || [];
      const total = points.slice(1).reduce((acc, p, i) => acc + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
      details += readOnly('Vértices', points.length);
      details += readOnly('Comprimento', total.toFixed(2));
    } else if (entity.type === 'rect') {
      details += input('x', 'Origem X', geo.x, 'number') + input('y', 'Origem Y', geo.y, 'number');
      details += input('width', 'Largura', geo.width, 'number') + input('height', 'Altura', geo.height, 'number');
    } else if (entity.type === 'circle') {
      details += input('cx', 'Centro X', geo.cx, 'number') + input('cy', 'Centro Y', geo.cy, 'number');
      details += input('radius', 'Raio', geo.radius, 'number');
      details += input('diameter', 'Diâmetro', ((geo.radius || 0) * 2).toFixed(2), 'number');
    } else if (entity.type === 'arc') {
      const sweep = ((geo.endAngle - geo.startAngle) * 180 / Math.PI + 360) % 360;
      details += input('cx', 'Centro X', geo.cx, 'number') + input('cy', 'Centro Y', geo.cy, 'number');
      details += input('radius', 'Raio', geo.radius, 'number');
      details += readOnly('Ângulo inicial', ((geo.startAngle || 0) * 180 / Math.PI).toFixed(2));
      details += readOnly('Ângulo final', ((geo.endAngle || 0) * 180 / Math.PI).toFixed(2));
      details += readOnly('Abertura', sweep.toFixed(2));
    } else if (entity.type === 'text') {
      details += input('text', 'Conteúdo', String(geo.text || ''));
      details += input('x', 'Posição X', geo.x, 'number') + input('y', 'Posição Y', geo.y, 'number');
      details += input('size', 'Tamanho', geo.size || 14, 'number');
    } else if (entity.type === 'shaft') {
      const total = (geo.segments || []).reduce((acc, s) => acc + Number(s.length || 0), 0);
      details += readOnly('Orientação', geo.orientation || 'horizontal');
      details += readOnly('Trechos', (geo.segments || []).length);
      details += readOnly('Comp. total', total.toFixed(2));
      details += input('origin.x', 'Origem X', geo.origin?.x || 0, 'number') + input('origin.y', 'Origem Y', geo.origin?.y || 0, 'number');
    } else if (entity.type === 'dimension' && geo.textPoint) {
      details += input('textPoint.x', 'Texto X', geo.textPoint.x, 'number') + input('textPoint.y', 'Texto Y', geo.textPoint.y, 'number');
      details += input('label', 'Texto', geo.label || '');
    }
    props.innerHTML = `<div class='cad-prop-row'><span class='cad-prop-label'>Tipo</span><span>${entity.type}</span></div><div class='cad-prop-row'><span class='cad-prop-label'>ID</span><span>${entity.id}</span></div><div class='cad-prop-row'><span class='cad-prop-label'>Camada</span><select class='cad-select' id='propLayer'>${Object.keys(this.state.layers || {}).map((l) => `<option ${l === layer ? 'selected' : ''} value='${l}'>${l}</option>`).join('')}</select></div>${details}`;
    document.getElementById('propLayer')?.addEventListener('change', (e) => { entity.metadata = { ...(entity.metadata || {}), layer: e.target.value }; this.pushHistory(); this.render(); });
    props.querySelectorAll('[data-prop]').forEach((el) => el.addEventListener('change', (e) => {
      const path = e.target.dataset.prop;
      const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
      if (Number.isNaN(value)) return;
      if ((entity.type === 'line' || entity.type === 'centerline') && (path === 'length' || path === 'angle')) {
        const x1 = Number(entity.geometry.x1 || 0);
        const y1 = Number(entity.geometry.y1 || 0);
        const currDx = Number(entity.geometry.x2 || 0) - x1;
        const currDy = Number(entity.geometry.y2 || 0) - y1;
        const currAngle = Math.atan2(currDy, currDx);
        const length = path === 'length' ? Number(value) : Math.hypot(currDx, currDy);
        const angleRad = path === 'angle' ? (Number(value) * Math.PI / 180) : currAngle;
        entity.geometry.x2 = x1 + Math.cos(angleRad) * length;
        entity.geometry.y2 = y1 + Math.sin(angleRad) * length;
        this.pushHistory();
        this.render();
        return;
      }
      if (entity.type === 'circle' && path === 'diameter') {
        entity.geometry.radius = Number(value) / 2;
        this.pushHistory();
        this.render();
        return;
      }
      const keys = path.split('.');
      let target = entity.geometry;
      for (let i = 0; i < keys.length - 1; i += 1) {
        target[keys[i]] = target[keys[i]] || {};
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;
      this.pushHistory();
      this.render();
    }));
  }

  syncToolbarState() {
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === this.state.activeTool || (this.state.activeTool === 'dimension' && b.dataset.tool === `dim_${this.state.dimensionMode || 'linear'}`)));
    document.querySelectorAll('.cad-status-toggle[data-toggle="grid"],#cadGridToggle').forEach((b) => b.classList.toggle('active', this.state.gridConfig.visible));
    document.querySelectorAll('.cad-status-toggle[data-toggle="snap"],#cadSnapToggle').forEach((b) => b.classList.toggle('active', this.state.snappingConfig.enabled));
    document.querySelectorAll('.cad-status-toggle[data-toggle="ortho"],#cadOrthoToggle').forEach((b) => b.classList.toggle('active', this.state.orthoEnabled));
  }


  ensureDefaultLayers() {
    const defaults = {
      contorno: { color: '#1f2937', visible: true, locked: false, lineType: 'continuous' },
      centro: { color: '#0f766e', visible: true, locked: false, lineType: 'center' },
      cotas: { color: '#2563eb', visible: true, locked: false, lineType: 'continuous' },
      eixos: { color: '#0e7490', visible: true, locked: false, lineType: 'center' },
      furacao: { color: '#065f46', visible: true, locked: false, lineType: 'dashed' },
      construcao: { color: '#6b7280', visible: true, locked: false, lineType: 'dashed' },
      observacoes: { color: '#1f2937', visible: true, locked: false, lineType: 'continuous' },
      geometria_principal: { color: '#1f2937', visible: true, locked: false, lineType: 'continuous' },
    };
    this.state.layers = { ...defaults, ...(this.state.layers || {}) };
    if (!this.state.layers[this.state.activeLayer]) this.state.activeLayer = 'geometria_principal';
  }

  renderLayersPanel() {
    const select = document.getElementById('cadLayerSelect');
    const list = document.getElementById('cadLayersList');
    const names = Object.keys(this.state.layers || {});
    if (select) {
      select.innerHTML = names.map((name) => `<option value="${name}" ${name === this.state.activeLayer ? 'selected' : ''}>${name}</option>`).join('');
    }
    if (!list) return;
    list.innerHTML = names.map((name) => {
      const cfg = this.state.layers[name] || {};
      return `<div class='cad-layer-row'>
        <div class='cad-layer-row-main'>
          <button class='cad-layer-activate ${name === this.state.activeLayer ? 'active' : ''}' data-layer-activate='${name}' title='Definir ativa'>●</button>
          <span>${name}</span>
        </div>
        <div class='cad-layer-row-controls'>
          <input type='color' value='${cfg.color || '#1f2937'}' data-layer-color='${name}' title='Cor'>
          <label><input type='checkbox' data-layer-visible='${name}' ${cfg.visible !== false ? 'checked' : ''}>V</label>
          <label><input type='checkbox' data-layer-locked='${name}' ${cfg.locked ? 'checked' : ''}>L</label>
        </div>
      </div>`;
    }).join('');

  }

  executeAction(action, source) {
    if (!action) return;
    if (action.startsWith('tool-')) {
      const tool = source?.dataset?.tool || action.slice(5).replaceAll('-', '_');
      const unsupported = ['copy', 'move', 'erase'];
      if (unsupported.includes(tool)) {
        this.state.statusMessage = `Ferramenta ${this.getToolLabel(tool)} em desenvolvimento`;
        this.render();
        return;
      }
      this.toolManager.set(tool);
      this.eventBus.emit('tool:changed', this.toolManager.name);
      this.state.statusMessage = `Ferramenta ativa: ${this.getToolLabel(tool)}`;
      this.render();
      return;
    }

    const actions = {
      'zoom-extents': () => this.viewport.zoomExtents(this.renderer.getGlobalBounds()),
      'reset-view': () => { this.viewport.resetView(); this.fitInitial(); },
      'toggle-grid': () => { this.state.gridConfig.visible = !this.state.gridConfig.visible; this.render(); },
      'toggle-snap': () => { this.state.snappingConfig.enabled = !this.state.snappingConfig.enabled; this.render(); },
      'toggle-ortho': () => { this.state.orthoEnabled = !this.state.orthoEnabled; this.render(); },
      'toggle-right-panel': () => {
        const root = document.querySelector('.cad-fullscreen');
        if (!root) return;
        root.classList.toggle('cad-right-collapsed');
        setTimeout(() => this.eventBus.emit('layout:changed'), 230);
      },
      'add-layer': () => {
        const base = document.getElementById('cadLayerNewName')?.value?.trim();
        if (!base) return;
        const name = this.state.layers[base] ? `${base}_${Date.now().toString().slice(-4)}` : base;
        this.state.layers[name] = { color: '#1f2937', visible: true, locked: false, lineType: 'continuous' };
        this.state.activeLayer = name;
        this.markDirty('Layer criada');
        this.render();
      },
      'delete-selection': () => {
        this.state.entities = this.state.entities.filter((e) => !this.selection.includes(e.id));
        this.selection.clear();
        this.pushHistory();
        this.render();
      },
      undo: () => {
        if (this.undoStack.length < 2) return;
        const cur = this.undoStack.pop();
        this.redoStack.push(cur);
        this.applySerialized(this.undoStack[this.undoStack.length - 1]);
      },
      redo: () => {
        if (!this.redoStack.length) return;
        const state = this.redoStack.pop();
        this.undoStack.push(state);
        this.applySerialized(state);
      },
      save: async () => { await this.saveDrawing(); this.render(); },
      'save-metadata': async () => { await this.saveMetadata(); },
    };

    const handler = actions[action];
    if (!handler) {
      // eslint-disable-next-line no-console
      console.warn('[CAD] Ação não mapeada:', action);
      return;
    }
    Promise.resolve(handler()).catch((e) => {
      this.state.statusMessage = e.message;
      this.render();
    });
  }

  scheduleAutosave() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(async () => {
      try {
        await this.saveDrawing();
      } catch (err) {
        this.state.statusMessage = `Auto-save falhou: ${err.message}`;
      }
      this.render();
    }, 1200);
  }

  async saveDrawing() {
    const id = window.CAD_INITIAL?.desenhoId;
    if (!id) return;
    const res = await fetch(`/desenho-tecnico/cad/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.serialize()) });
    if (!res.ok) throw new Error('Falha ao salvar desenho');
    this.state.statusMessage = 'Desenho salvo com sucesso';
  }

  async saveMetadata() {
    const id = window.CAD_INITIAL?.desenhoId;
    const payload = {
      codigo: document.getElementById('cadMetaCodigo')?.value,
      titulo: document.getElementById('cadMetaTitulo')?.value,
      material: document.getElementById('cadMetaMaterial')?.value,
      equipamento_id: document.getElementById('cadMetaEquipamento')?.value || null,
      observacoes: document.getElementById('cadMetaObservacoes')?.value,
    };
    const res = await fetch(`/desenho-tecnico/cad/${id}/metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error('Falha ao salvar metadados');
    this.state.metadata = payload;
    this.state.statusMessage = 'Metadados salvos';
    this.render();
  }

  bindUI() {
    if (this.isUiBound) return;
    this.isUiBound = true;
    // eslint-disable-next-line no-console
    console.info('[CAD] Editor inicializado, iniciando bind de eventos');
    window.addEventListener('resize', () => {
      this.reflowWorkspace();
      this.viewport.resize();
      this.render();
    });
    this.eventBus.on('viewport:changed', () => this.render());
    this.eventBus.on('selection:changed', () => this.render());
    this.eventBus.on('entity:hovered', () => this.render());
    this.eventBus.on('prompt:changed', () => this.render());
    this.eventBus.on('cursor:move', (c) => { this.updateStatus(c); this.render(); });
    document.querySelectorAll('[data-tool]').forEach((btn) => {
      const unsupported = ['copy', 'move', 'erase'];
      if (!unsupported.includes(btn.dataset.tool)) return;
      btn.disabled = true;
      btn.title = 'Ferramenta em desenvolvimento';
    });
    this.configureTooltips();
    const cadRoot = document.querySelector('.cad-fullscreen');
    if (!cadRoot) {
      // eslint-disable-next-line no-console
      console.warn('[CAD] Container raiz não encontrado para bind da toolbar');
      return;
    }
    // eslint-disable-next-line no-console
    console.info('[CAD] Toolbar encontrada; registrando delegação de eventos');
    cadRoot.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action],[data-layer-activate]');
      if (!target) return;
      if (target.dataset.layerActivate) {
        this.state.activeLayer = target.dataset.layerActivate;
        this.render();
        return;
      }
      this.executeAction(target.dataset.action, target);
    });
    cadRoot.addEventListener('change', (event) => {
      const target = event.target;
      if (target.dataset.layerVisible) {
        this.state.layers[target.dataset.layerVisible].visible = target.checked;
        this.render();
      } else if (target.dataset.layerLocked) {
        this.state.layers[target.dataset.layerLocked].locked = target.checked;
        this.render();
      } else if (target.dataset.layerColor) {
        this.state.layers[target.dataset.layerColor].color = target.value;
        this.render();
      }
    });
    document.getElementById('cadLayerSelect')?.addEventListener('change', (e) => { this.state.activeLayer = e.target.value; this.render(); });
    this.setupLayoutControls();
    this.reflowWorkspace();
    // eslint-disable-next-line no-console
    console.info('[CAD] Bind de eventos concluído');
    window.addEventListener('keydown', async (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); this.executeAction('save'); }
      if (e.key === 'Delete') this.executeAction('delete-selection');
      if (e.ctrlKey && e.key.toLowerCase() === 'z') this.executeAction('undo');
      if (e.ctrlKey && e.key.toLowerCase() === 'y') this.executeAction('redo');
    });
  }

  configureTooltips() {
    document.querySelectorAll('.cad-panel-left .cad-tool-btn[data-tool]').forEach((btn) => {
      const tool = btn.dataset.tool;
      const label = this.getToolLabel(tool);
      const hint = TOOL_HINTS[tool];
      const tip = hint ? `${label} — ${hint}` : label;
      btn.dataset.tooltip = tip;
      btn.setAttribute('title', tip);
      btn.setAttribute('aria-label', label);
    });
  }

  reflowWorkspace() {
    const root = document.querySelector('.cad-fullscreen');
    const workspace = document.getElementById('cadWorkspace');
    const toolbar = root?.querySelector('.cad-toolbar');
    const status = root?.querySelector('.cad-statusbar');
    if (!root || !workspace || !toolbar || !status) return;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const available = Math.max(180, viewportHeight - toolbar.getBoundingClientRect().height - status.getBoundingClientRect().height);
    workspace.style.height = `${Math.floor(available)}px`;
  }

  setupLayoutControls() {
    const root = document.querySelector('.cad-fullscreen');
    const rightToggle = document.getElementById('cadRightToggle');
    if (!root || !rightToggle) return;

    const syncToggle = () => {
      const collapsed = root.classList.contains('cad-right-collapsed');
      rightToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      rightToggle.setAttribute('aria-label', collapsed ? 'Expandir painel direito' : 'Recolher painel direito');
      rightToggle.setAttribute('title', collapsed ? 'Expandir painel direito' : 'Recolher painel direito');
    };

    syncToggle();
    this.eventBus.on('layout:changed', () => {
      this.reflowWorkspace();
      this.viewport.resize();
      this.render();
      syncToggle();
    });
  }
}
