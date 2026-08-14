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
import { MoveTool } from './tools/move.tool.js';
import { CopyTool } from './tools/copy.tool.js';
import { EraseTool } from './tools/erase.tool.js';
import { LineEntity } from './entities/line.entity.js';
import { RectEntity } from './entities/rect.entity.js';
import { CircleEntity } from './entities/circle.entity.js';
import { PolylineEntity } from './entities/polyline.entity.js';
import { TextEntity } from './entities/text.entity.js';
import { DimensionEntity } from './entities/dimension.entity.js';
import { ArcEntity } from './entities/arc.entity.js';
import { ShaftEntity } from './entities/shaft.entity.js';
import {
  angle2D,
  circleCircleIntersections,
  isAngleBetween,
  lineCircleIntersections,
  normalizeAngle,
  projectPointToSegment,
  segmentIntersection as intersectSegments,
} from './core/geometry.js';

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

const COMMAND_ALIASES = {
  s: 'tool-select', select: 'tool-select', selecionar: 'tool-select',
  h: 'tool-pan', pan: 'tool-pan',
  l: 'tool-line', line: 'tool-line', linha: 'tool-line',
  p: 'tool-polyline', pl: 'tool-polyline', polyline: 'tool-polyline', polilinha: 'tool-polyline',
  r: 'tool-rect', rec: 'tool-rect', rect: 'tool-rect', retangulo: 'tool-rect', 'retângulo': 'tool-rect',
  c: 'tool-circle', circle: 'tool-circle', circulo: 'tool-circle', 'círculo': 'tool-circle',
  a: 'tool-arc', arc: 'tool-arc', arco: 'tool-arc',
  t: 'tool-text', text: 'tool-text', texto: 'tool-text',
  m: 'tool-move', move: 'tool-move', mover: 'tool-move',
  co: 'tool-copy', cp: 'tool-copy', copy: 'tool-copy', copiar: 'tool-copy',
  e: 'tool-erase', erase: 'tool-erase', apagar: 'tool-erase',
  o: 'tool-offset', offset: 'tool-offset',
  tr: 'tool-trim', trim: 'tool-trim', cortar: 'tool-trim',
  ex: 'tool-extend', extend: 'tool-extend', estender: 'tool-extend',
  mi: 'tool-mirror', mirror: 'tool-mirror', espelhar: 'tool-mirror',
  di: 'tool-measure', dist: 'tool-measure', measure: 'tool-measure', medir: 'tool-measure',
  d: 'tool-dim-linear', dim: 'tool-dim-linear', cota: 'tool-dim-linear',
  dd: 'tool-dim-diameter', diametro: 'tool-dim-diameter', 'diâmetro': 'tool-dim-diameter',
  da: 'tool-dim-angular', angular: 'tool-dim-angular',
  cl: 'tool-centerline', centro: 'tool-centerline',
  x: 'tool-shaft', eixo: 'tool-shaft',
  zw: 'tool-zoom-window', janela: 'tool-zoom-window',
  ze: 'zoom-extents', extents: 'zoom-extents',
  u: 'undo', undo: 'undo', desfazer: 'undo',
  redo: 'redo', refazer: 'redo',
  del: 'delete-selection', delete: 'delete-selection',
  grid: 'toggle-grid', grade: 'toggle-grid',
  snap: 'toggle-snap', osnap: 'toggle-snap',
  ortho: 'toggle-ortho', ortogonal: 'toggle-ortho',
  save: 'save', salvar: 'save',
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
      isEntityEditable: (entity) => this.isEntityEditable(entity),
      toolManager: this.toolManager,
      markDirty: (msg) => this.markDirty(msg),
      pushHistory: () => this.pushHistory(),
      render: () => this.render(),
      get statusMessage() { return this.state.statusMessage; },
      set statusMessage(v) { this.state.statusMessage = v; },
      getPoint: (point, from = null) => this.getPoint(point, from),
      getAssistGuides: (from, to) => this.getAssistGuides(from, to),
      showDynamicInput: (cfg) => this.showDynamicInput(cfg),
      hideDynamicInput: () => this.hideDynamicInput(),
    };
    [
      new SelectTool(this.ctx), new PanTool(this.ctx), new LineTool(this.ctx), new PolylineTool(this.ctx), new RectTool(this.ctx), new CircleTool(this.ctx), new ArcTool(this.ctx), new TextTool(this.ctx),
      new CenterlineTool(this.ctx), new ShaftTool(this.ctx), new DimensionTool(this.ctx), new MeasureTool(this.ctx), new ZoomWindowTool(this.ctx),
      new TrimTool(this.ctx), new ExtendTool(this.ctx), new OffsetTool(this.ctx), new MirrorTool(this.ctx),
      new MoveTool(this.ctx), new CopyTool(this.ctx), new EraseTool(this.ctx),
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
      codigo: initial.codigo || '', titulo: initial.titulo || '', material: initial.material || '', equipamento_id: initial.equipamento_id || '', observacoes: initial.observacoes || '', unidade: initial.unidade || 'mm',
    };
    const base = (o, fallbackLayer = this.state.activeLayer) => ({
      id: o.id,
      style: { ...(o.style || {}) },
      visible: o.visible !== false,
      metadata: { ...(o.metadata || {}), layer: o.layer || o.metadata?.layer || fallbackLayer },
    });
    const map = {
      line: (o) => new LineEntity({ ...base(o), type: o.type, geometry: { x1: o.x, y1: o.y, x2: o.x2, y2: o.y2 } }),
      centerline: (o) => new LineEntity({ ...base(o, 'centro'), type: 'centerline', geometry: { x1: o.x, y1: o.y, x2: o.x2, y2: o.y2 }, style: { stroke: '#93c5fd', ...(o.style || {}) } }),
      rect: (o) => new RectEntity({ ...base(o), geometry: { x: o.x, y: o.y, width: o.width, height: o.height } }),
      circle: (o) => new CircleEntity({ ...base(o), geometry: { cx: o.x, cy: o.y, radius: o.radius } }),
      polyline: (o) => new PolylineEntity({ ...base(o), geometry: { points: o.points || [], closed: Boolean(o.closed) } }),
      text: (o) => new TextEntity({ ...base(o, 'observacoes'), geometry: { x: o.x, y: o.y, text: o.text, size: o.size || 14 } }),
      dimension: (o) => new DimensionEntity({ ...base(o, 'cotas'), geometry: o.geometry || {} }),
      arc: (o) => new ArcEntity({ ...base(o), geometry: o.geometry || { cx: o.cx, cy: o.cy, radius: o.radius, startAngle: o.startAngle, endAngle: o.endAngle, ccw: o.ccw !== false } }),
      shaft: (o) => new ShaftEntity({ ...base(o, 'eixos'), geometry: o.geometry || {} }),
    };
    const entityById = new Map();
    [...(initial.objects || []), ...(initial.dimensions || [])].forEach((o) => {
      if (!map[o.type]) return;
      const entity = map[o.type](o);
      entityById.set(String(entity.id), entity);
    });
    this.state.entities.push(...entityById.values());
  }

  serialize() {
    const objects = this.state.entities.map((e) => {
      const layer = e.metadata?.layer || this.state.activeLayer;
      const common = { id: e.id, type: e.type, layer, style: e.style || {}, metadata: e.metadata || {}, visible: e.visible !== false };
      if (e.type === 'line' || e.type === 'centerline') return { ...common, x: e.geometry.x1, y: e.geometry.y1, x2: e.geometry.x2, y2: e.geometry.y2 };
      if (e.type === 'rect') return { ...common, x: e.geometry.x, y: e.geometry.y, width: e.geometry.width, height: e.geometry.height };
      if (e.type === 'circle') return { ...common, x: e.geometry.cx, y: e.geometry.cy, radius: e.geometry.radius };
      if (e.type === 'polyline') return { ...common, points: e.geometry.points, closed: Boolean(e.geometry.closed) };
      if (e.type === 'text') return { ...common, x: e.geometry.x, y: e.geometry.y, text: e.geometry.text, size: e.geometry.size };
      if (e.type === 'dimension' || e.type === 'arc' || e.type === 'shaft') return { ...common, geometry: e.geometry };
      return common;
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
    const snapshot = JSON.stringify(this.serialize());
    if (this.undoStack[this.undoStack.length - 1] === snapshot) return;
    this.undoStack.push(snapshot);
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
    const circles = [];
    const asPoint = (x, y, kind) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!points.some((point) => point.kind === kind && Math.hypot(point.x - x, point.y - y) <= 1e-8)) points.push({ x, y, kind });
    };
    const asSegment = (a, b, entity) => segments.push({ a, b, entity });
    this.state.entities.forEach((e) => {
      const layer = this.state.layers[e.metadata?.layer || this.state.activeLayer] || {};
      if (e.visible === false || layer.visible === false) return;
      if (e.type === 'line' || e.type === 'centerline') {
        asPoint(e.geometry.x1, e.geometry.y1, 'endpoint');
        asPoint(e.geometry.x2, e.geometry.y2, 'endpoint');
        asPoint((e.geometry.x1 + e.geometry.x2) / 2, (e.geometry.y1 + e.geometry.y2) / 2, 'midpoint');
        asSegment({ x: e.geometry.x1, y: e.geometry.y1 }, { x: e.geometry.x2, y: e.geometry.y2 }, e);
      }
      if (e.type === 'rect') {
        const minX = Math.min(e.geometry.x, e.geometry.x + e.geometry.width);
        const maxX = Math.max(e.geometry.x, e.geometry.x + e.geometry.width);
        const minY = Math.min(e.geometry.y, e.geometry.y + e.geometry.height);
        const maxY = Math.max(e.geometry.y, e.geometry.y + e.geometry.height);
        const corners = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
        corners.forEach((corner, index) => {
          const next = corners[(index + 1) % corners.length];
          asPoint(corner.x, corner.y, 'endpoint');
          asPoint((corner.x + next.x) / 2, (corner.y + next.y) / 2, 'midpoint');
          asSegment(corner, next, e);
        });
        asPoint((minX + maxX) / 2, (minY + maxY) / 2, 'center');
      }
      if (e.type === 'circle') {
        asPoint(e.geometry.cx, e.geometry.cy, 'center');
        [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach((angle) => asPoint(e.geometry.cx + Math.cos(angle) * e.geometry.radius, e.geometry.cy + Math.sin(angle) * e.geometry.radius, 'quadrant'));
        circles.push({ center: { x: e.geometry.cx, y: e.geometry.cy }, radius: e.geometry.radius, entity: e });
      }
      if (e.type === 'arc') {
        asPoint(e.geometry.cx, e.geometry.cy, 'center');
        const a0 = normalizeAngle(e.geometry.startAngle || 0);
        const a1 = normalizeAngle(e.geometry.endAngle || 0);
        const ccw = e.geometry.ccw !== false;
        const sweep = ccw ? normalizeAngle(a1 - a0) : normalizeAngle(a0 - a1);
        const mid = a0 + (ccw ? 1 : -1) * sweep / 2;
        asPoint(e.geometry.cx + Math.cos(a0) * e.geometry.radius, e.geometry.cy + Math.sin(a0) * e.geometry.radius, 'endpoint');
        asPoint(e.geometry.cx + Math.cos(a1) * e.geometry.radius, e.geometry.cy + Math.sin(a1) * e.geometry.radius, 'endpoint');
        asPoint(e.geometry.cx + Math.cos(mid) * e.geometry.radius, e.geometry.cy + Math.sin(mid) * e.geometry.radius, 'midpoint');
        circles.push({ center: { x: e.geometry.cx, y: e.geometry.cy }, radius: e.geometry.radius, entity: e });
      }
      if (e.type === 'polyline') (e.geometry.points || []).forEach((pt, idx, arr) => {
        asPoint(pt.x, pt.y, 'endpoint');
        if (idx < arr.length - 1) {
          asPoint((pt.x + arr[idx + 1].x) / 2, (pt.y + arr[idx + 1].y) / 2, 'midpoint');
          asSegment(pt, arr[idx + 1], e);
        }
      });
    });
    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        if (segments[i].entity.id === segments[j].entity.id) continue;
        const hit = intersectSegments(segments[i].a, segments[i].b, segments[j].a, segments[j].b);
        if (hit) asPoint(hit.x, hit.y, 'intersection');
      }
    }
    const isOnCircleEntity = (point, item) => item.entity.type !== 'arc' || isAngleBetween(angle2D(item.center, point), item.entity.geometry.startAngle, item.entity.geometry.endAngle, item.entity.geometry.ccw !== false);
    segments.forEach((segment) => circles.forEach((circle) => {
      if (segment.entity.id === circle.entity.id) return;
      lineCircleIntersections(segment.a, segment.b, circle.center, circle.radius, true)
        .filter((point) => isOnCircleEntity(point, circle))
        .forEach((point) => asPoint(point.x, point.y, 'intersection'));
    }));
    for (let i = 0; i < circles.length; i += 1) {
      for (let j = i + 1; j < circles.length; j += 1) {
        circleCircleIntersections(circles[i].center, circles[i].radius, circles[j].center, circles[j].radius)
          .filter((point) => isOnCircleEntity(point, circles[i]) && isOnCircleEntity(point, circles[j]))
          .forEach((point) => asPoint(point.x, point.y, 'intersection'));
      }
    }
    return points;
  }

  getNearestPointOnEntity(entity, point) {
    const g = entity.geometry || {};
    if (entity.type === 'line' || entity.type === 'centerline') {
      return { ...projectPointToSegment(point, { x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }).point, kind: 'nearest' };
    }
    if (entity.type === 'circle' || entity.type === 'arc') {
      const a = Math.atan2(point.y - g.cy, point.x - g.cx);
      if (entity.type === 'arc' && !isAngleBetween(a, g.startAngle, g.endAngle, g.ccw !== false)) return null;
      return { x: g.cx + Math.cos(a) * g.radius, y: g.cy + Math.sin(a) * g.radius, kind: 'nearest' };
    }
    let segments = [];
    if (entity.type === 'polyline') segments = (g.points || []).slice(1).map((end, index) => [g.points[index], end]);
    if (entity.type === 'rect') {
      const x2 = g.x + g.width; const y2 = g.y + g.height;
      const corners = [{ x: g.x, y: g.y }, { x: x2, y: g.y }, { x: x2, y: y2 }, { x: g.x, y: y2 }];
      segments = corners.map((start, index) => [start, corners[(index + 1) % corners.length]]);
    }
    const best = segments.map(([a, b]) => projectPointToSegment(point, a, b)).sort((a, b) => a.distance - b.distance)[0];
    if (best) return { ...best.point, kind: 'nearest' };
    return null;
  }

  segmentIntersection(p1, p2, p3, p4) {
    return intersectSegments(p1, p2, p3, p4);
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
    const priority = { intersection: 1, endpoint: 2, midpoint: 3, center: 4, quadrant: 4, nearest: 5, grid: 6 };
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

  getAssistGuides(from, to) {
    if (!from || !to) return [];
    const guides = [];
    const eps = 0.8 / Math.max(this.viewport.getViewState().zoom, 0.1);
    if (Math.abs(to.x - from.x) <= eps) guides.push({ type: 'guide', kind: 'vertical', from: { x: from.x, y: from.y - 2000 }, to: { x: from.x, y: from.y + 2000 } });
    if (Math.abs(to.y - from.y) <= eps) guides.push({ type: 'guide', kind: 'horizontal', from: { x: from.x - 2000, y: from.y }, to: { x: from.x + 2000, y: from.y } });

    const segDx = to.x - from.x;
    const segDy = to.y - from.y;
    const segLen = Math.hypot(segDx, segDy) || 1;

    this.state.entities.forEach((e) => {
      if (e.type === 'line' || e.type === 'centerline') {
        const dx = (e.geometry.x2 || 0) - (e.geometry.x1 || 0);
        const dy = (e.geometry.y2 || 0) - (e.geometry.y1 || 0);
        const len = Math.hypot(dx, dy) || 1;
        const cross = Math.abs((segDx / segLen) * (dy / len) - (segDy / segLen) * (dx / len));
        if (cross < 0.04) {
          const anchor = { x: e.geometry.x1 || 0, y: e.geometry.y1 || 0 };
          guides.push({ type: 'guide', kind: 'parallel', from: anchor, to: { x: anchor.x + (segDx / segLen) * 2000, y: anchor.y + (segDy / segLen) * 2000 } });
        }
      }
      const pts = [];
      if (e.type === 'line' || e.type === 'centerline') {
        pts.push({ x: e.geometry.x1, y: e.geometry.y1 }, { x: e.geometry.x2, y: e.geometry.y2 }, { x: (e.geometry.x1 + e.geometry.x2) / 2, y: (e.geometry.y1 + e.geometry.y2) / 2 });
      } else if (e.type === 'circle') {
        pts.push({ x: e.geometry.cx, y: e.geometry.cy });
      }
      pts.forEach((pt) => {
        if (Math.abs(to.x - pt.x) <= eps) guides.push({ type: 'guide', kind: 'vertical', from: { x: pt.x, y: pt.y - 1800 }, to: { x: pt.x, y: pt.y + 1800 } });
        if (Math.abs(to.y - pt.y) <= eps) guides.push({ type: 'guide', kind: 'horizontal', from: { x: pt.x - 1800, y: pt.y }, to: { x: pt.x + 1800, y: pt.y } });
      });
    });
    return guides.slice(0, 4);
  }

  showDynamicInput(cfg = {}) {
    const overlay = document.getElementById('cadDynamicInput');
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.style.left = `${Math.max(8, cfg.x || 8)}px`;
    overlay.style.top = `${Math.max(8, cfg.y || 8)}px`;
    overlay.innerHTML = `<button type='button' class='cad-dyn-value'>${cfg.value || '0.00'}</button><input class='cad-dyn-input' type='text' inputmode='decimal' value='${cfg.value || ''}' style='display:none;'/>`;
    const valueBtn = overlay.querySelector('.cad-dyn-value');
    const input = overlay.querySelector('.cad-dyn-input');
    const enterEdit = () => {
      valueBtn.style.display = 'none';
      input.style.display = 'inline-flex';
      input.focus();
      input.select();
    };
    valueBtn.addEventListener('click', enterEdit);
    input.addEventListener('input', () => cfg.onChange?.(input.value.replace(',', '.')));
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        const ok = cfg.onConfirm?.(input.value.replace(',', '.'));
        if (ok !== false) this.hideDynamicInput();
      }
      if (evt.key === 'Escape') {
        evt.preventDefault();
        cfg.onCancel?.();
        this.hideDynamicInput();
      }
    });
  }

  hideDynamicInput() {
    const overlay = document.getElementById('cadDynamicInput');
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.innerHTML = '';
  }


  findEntityAt(world) {
    return [...this.state.entities].reverse().find((entity) => {
      const layer = this.state.layers[entity.metadata?.layer || this.state.activeLayer] || {};
      return entity.visible !== false && layer.visible !== false && entity.hitTest(world, 6 / this.viewport.getViewState().zoom);
    });
  }

  isEntityEditable(entity) {
    if (!entity || entity.visible === false) return false;
    const layer = this.state.layers[entity.metadata?.layer || this.state.activeLayer] || {};
    return layer.visible !== false && layer.locked !== true;
  }

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
    document.getElementById('propLayer')?.addEventListener('change', (e) => { entity.metadata = { ...(entity.metadata || {}), layer: e.target.value }; this.pushHistory(); this.markDirty('Camada do objeto atualizada'); this.render(); });
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
        this.markDirty('Propriedade atualizada');
        this.render();
        return;
      }
      if (entity.type === 'circle' && path === 'diameter') {
        entity.geometry.radius = Number(value) / 2;
        this.pushHistory();
        this.markDirty('Propriedade atualizada');
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
      this.markDirty('Propriedade atualizada');
      this.render();
    }));
  }

  syncToolbarState() {
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === this.state.activeTool || (this.state.activeTool === 'dimension' && b.dataset.tool === `dim_${this.state.dimensionMode || 'linear'}`)));
    document.querySelectorAll('.cad-status-toggle[data-toggle="grid"],#cadGridToggle').forEach((b) => b.classList.toggle('active', this.state.gridConfig.visible));
    document.querySelectorAll('.cad-status-toggle[data-toggle="snap"],#cadSnapToggle').forEach((b) => b.classList.toggle('active', this.state.snappingConfig.enabled));
    document.querySelectorAll('.cad-status-toggle[data-toggle="ortho"],#cadOrthoToggle').forEach((b) => b.classList.toggle('active', this.state.orthoEnabled));
    const gridStepInput = document.getElementById('cadGridStepInput');
    if (gridStepInput && document.activeElement !== gridStepInput) gridStepInput.value = String(this.state.gridConfig.step);
    document.querySelectorAll('[data-snap-option]').forEach((input) => {
      input.checked = this.state.snappingConfig[input.dataset.snapOption] !== false;
      input.disabled = !this.state.snappingConfig.enabled;
    });
  }


  ensureDefaultLayers() {
    const defaults = {
      contorno: { color: '#1f2937', visible: true, locked: false, lineType: 'continuous' },
      centro: { color: '#0f766e', visible: true, locked: false, lineType: 'center' },
      linhas_de_centro: { color: '#0f766e', visible: true, locked: false, lineType: 'center' },
      cotas: { color: '#2563eb', visible: true, locked: false, lineType: 'continuous' },
      eixos: { color: '#0e7490', visible: true, locked: false, lineType: 'center' },
      furacao: { color: '#065f46', visible: true, locked: false, lineType: 'dashed' },
      furos: { color: '#065f46', visible: true, locked: false, lineType: 'dashed' },
      construcao: { color: '#6b7280', visible: true, locked: false, lineType: 'dashed' },
      observacoes: { color: '#1f2937', visible: true, locked: false, lineType: 'continuous' },
      textos: { color: '#1f2937', visible: true, locked: false, lineType: 'continuous' },
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
      this.toolManager.set(tool);
      this.eventBus.emit('tool:changed', this.toolManager.name);
      this.state.statusMessage = `Ferramenta ativa: ${this.getToolLabel(tool)}`;
      this.render();
      return;
    }

    const actions = {
      'zoom-extents': () => this.viewport.zoomExtents(this.renderer.getGlobalBounds()),
      'reset-view': () => { this.viewport.resetView(); this.fitInitial(); },
      'toggle-grid': () => { this.state.gridConfig.visible = !this.state.gridConfig.visible; this.markDirty('Grade atualizada'); this.render(); },
      'toggle-snap': () => { this.state.snappingConfig.enabled = !this.state.snappingConfig.enabled; this.markDirty('Snap atualizado'); this.render(); },
      'toggle-ortho': () => { this.state.orthoEnabled = !this.state.orthoEnabled; this.markDirty('Ortho atualizado'); this.render(); },
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
        const removable = new Set(this.state.entities.filter((entity) => this.selection.includes(entity.id) && this.isEntityEditable(entity)).map((entity) => entity.id));
        if (!removable.size) return;
        this.state.entities = this.state.entities.filter((entity) => !removable.has(entity.id));
        this.selection.clear();
        this.pushHistory();
        this.markDirty(`Apagados ${removable.size} objeto(s)`);
        this.render();
      },
      undo: () => {
        if (this.undoStack.length < 2) return;
        const cur = this.undoStack.pop();
        this.redoStack.push(cur);
        this.applySerialized(this.undoStack[this.undoStack.length - 1]);
        this.markDirty('Alteração desfeita');
      },
      redo: () => {
        if (!this.redoStack.length) return;
        const state = this.redoStack.pop();
        this.undoStack.push(state);
        this.applySerialized(state);
        this.markDirty('Alteração refeita');
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

  executeCommand(rawCommand) {
    const command = String(rawCommand || '').trim().toLowerCase();
    if (!command) return false;
    const action = COMMAND_ALIASES[command];
    if (!action) {
      this.state.statusMessage = `Comando não reconhecido: ${rawCommand}`;
      this.render();
      return false;
    }
    const tool = action.startsWith('tool-dim-') ? action.slice(5).replace('dim-', 'dim_') : (action.startsWith('tool-') ? action.slice(5) : '');
    this.executeAction(action, tool ? { dataset: { tool } } : null);
    return true;
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
      if (target.id === 'cadGridStepInput') {
        const value = Number(target.value);
        if (!Number.isFinite(value) || value < 0.001) {
          target.value = String(this.state.gridConfig.step);
          return;
        }
        this.state.gridConfig.step = value;
        this.markDirty('Passo da grade atualizado');
        this.render();
      } else if (target.dataset.snapOption) {
        this.state.snappingConfig[target.dataset.snapOption] = target.checked;
        this.markDirty(`Snap ${target.dataset.snapOption} atualizado`);
        this.render();
      } else if (target.dataset.layerVisible) {
        this.state.layers[target.dataset.layerVisible].visible = target.checked;
        this.markDirty('Visibilidade da camada atualizada');
        this.render();
      } else if (target.dataset.layerLocked) {
        this.state.layers[target.dataset.layerLocked].locked = target.checked;
        this.markDirty('Bloqueio da camada atualizado');
        this.render();
      } else if (target.dataset.layerColor) {
        this.state.layers[target.dataset.layerColor].color = target.value;
        this.markDirty('Cor da camada atualizada');
        this.render();
      }
    });
    document.getElementById('cadLayerSelect')?.addEventListener('change', (e) => { this.state.activeLayer = e.target.value; this.render(); });
    this.setupLayoutControls();
    this.reflowWorkspace();
    this.viewport.resize();
    this.render();
    // eslint-disable-next-line no-console
    console.info('[CAD] Bind de eventos concluído');
    const commandInput = document.getElementById('cadCommandInput');
    commandInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        commandInput.value = '';
        commandInput.blur();
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      const command = commandInput.value;
      commandInput.value = '';
      if (this.executeCommand(command)) commandInput.blur();
    });
    window.addEventListener('keydown', async (e) => {
      const activeEl = document.activeElement;
      const isFormField = activeEl && (
        activeEl.tagName === 'INPUT'
        || activeEl.tagName === 'TEXTAREA'
        || activeEl.tagName === 'SELECT'
        || activeEl.isContentEditable
      );
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); this.executeAction('save'); }
      if (!isFormField && e.key === 'Delete') this.executeAction('delete-selection');
      if (e.ctrlKey && e.key.toLowerCase() === 'z') this.executeAction('undo');
      if (e.ctrlKey && e.key.toLowerCase() === 'y') this.executeAction('redo');
      if (!isFormField && !e.ctrlKey && !e.altKey && !e.metaKey && this.toolManager.name === 'select' && /^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        commandInput?.focus();
        if (commandInput) commandInput.value += e.key;
        return;
      }
      if (e.key === 'Escape') {
        const isCadDynInput = activeEl?.classList?.contains('cad-dyn-input');
        if (isFormField && !isCadDynInput) return;
        e.preventDefault();
        this.hideDynamicInput();
        this.toolManager.active?.cancel?.();
        if (this.toolManager.name !== 'select') {
          this.toolManager.set('select');
          this.eventBus.emit('tool:changed', this.toolManager.name);
        }
        this.render();
      }
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
    const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
    const rootRect = root.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    const rootTop = Math.max(0, rootRect.top || 0);
    const rootHeight = Math.max(rootRect.height || 0, viewportHeight - rootTop);
    root.style.height = `${Math.floor(rootHeight)}px`;
    const available = Math.max(220, rootHeight - toolbarRect.height - statusRect.height);
    workspace.style.height = `${Math.floor(available)}px`;
    workspace.style.minHeight = `${Math.floor(available)}px`;
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
