import { BaseTool } from './base.tool.js';
import { PolylineEntity } from '../entities/polyline.entity.js';
import { LineEntity } from '../entities/line.entity.js';
import {
  breakLineGeometry,
  ellipsePoints,
  hatchSegmentsForPolygon,
  joinLineSegments,
  polarArrayAngles,
  rectangularArrayOffsets,
  rotateEntityGeometry,
  scaleEntityGeometry,
  splinePoints,
} from '../core/final.geometry.mjs';

function editableSelected(ctx) {
  return ctx.state.entities.filter((entity) => ctx.selection.includes(entity.id) && ctx.isEntityEditable(entity));
}

function freshClone(entity) {
  const clone = entity.clone();
  clone.id = crypto.randomUUID();
  return clone;
}

function replaceEntityGeometry(entity, geometry) {
  entity.geometry = geometry;
}

function removeEntities(ctx, ids) {
  const set = new Set(ids);
  ctx.state.entities = ctx.state.entities.filter((entity) => !set.has(entity.id));
  ctx.selection.clear();
}

function boundaryPolygon(entity) {
  if (!entity) return null;
  if (entity.type === 'rect') {
    const { x, y, width, height } = entity.geometry;
    return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  }
  if (entity.type === 'polyline' && entity.geometry.closed && (entity.geometry.points || []).length >= 3) return entity.geometry.points.map((p) => ({ x: p.x, y: p.y }));
  if (entity.type === 'circle') {
    return ellipsePoints({ x: entity.geometry.cx, y: entity.geometry.cy }, entity.geometry.radius, entity.geometry.radius, 0, 96);
  }
  return null;
}

function promptNumber(label, fallback, { min = -Infinity, allowZero = true } = {}) {
  const raw = window.prompt(label, String(fallback));
  if (raw == null) return null;
  const value = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(value) || value < min || (!allowZero && value === 0)) return null;
  return value;
}

export class EllipseTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'ellipse'; this.center = null; this.major = null; }
  activate() { this.center = null; this.major = null; this.ctx.prompt.set({ message: 'Elipse: informe o centro' }); }
  onMouseDown(evt) {
    const point = this.ctx.getPoint(evt.world, this.center || this.major);
    if (!this.center) { this.center = point; this.ctx.prompt.set({ message: 'Elipse: informe o eixo maior' }); return; }
    if (!this.major) { this.major = point; this.ctx.prompt.set({ message: 'Elipse: informe o semi-eixo menor' }); return; }
    const vx = this.major.x - this.center.x; const vy = this.major.y - this.center.y;
    const rx = Math.hypot(vx, vy);
    const rotation = Math.atan2(vy, vx);
    const nx = -Math.sin(rotation); const ny = Math.cos(rotation);
    const ry = Math.abs((point.x - this.center.x) * nx + (point.y - this.center.y) * ny);
    if (rx < 1e-6 || ry < 1e-6) { this.ctx.statusMessage = 'Elipse inválida: eixos precisam ser maiores que zero.'; return; }
    this.ctx.addEntity(new PolylineEntity({
      geometry: { points: ellipsePoints(this.center, rx, ry, rotation, 120), closed: true },
      metadata: { layer: this.ctx.state.activeLayer, primitive: 'ellipse', rx, ry, rotation },
    }));
    this.center = null; this.major = null; this.clearPreview();
    this.ctx.prompt.set({ message: 'Elipse criada. Informe um novo centro ou ESC.' });
  }
  onMouseMove(evt) {
    if (!this.center) return;
    const point = this.ctx.getPoint(evt.world, this.major || this.center);
    let rx; let ry; let rotation;
    if (!this.major) { rx = Math.hypot(point.x - this.center.x, point.y - this.center.y); ry = Math.max(rx * 0.5, 0.1); rotation = Math.atan2(point.y - this.center.y, point.x - this.center.x); }
    else {
      const vx = this.major.x - this.center.x; const vy = this.major.y - this.center.y;
      rx = Math.hypot(vx, vy); rotation = Math.atan2(vy, vx);
      const nx = -Math.sin(rotation); const ny = Math.cos(rotation);
      ry = Math.max(0.1, Math.abs((point.x - this.center.x) * nx + (point.y - this.center.y) * ny));
    }
    const ghost = new PolylineEntity({ geometry: { points: ellipsePoints(this.center, rx, ry, rotation, 80), closed: true }, metadata: { layer: this.ctx.state.activeLayer } });
    this.setPreview([{ type: 'ghost-entity', entity: ghost }]);
  }
  cancel() { this.center = null; this.major = null; this.clearPreview(); }
}

export class SplineTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'spline'; this.points = []; }
  activate() { this.points = []; this.ctx.prompt.set({ message: 'Spline: clique nos pontos de controle e pressione Enter para finalizar' }); }
  onMouseDown(evt) { this.points.push(this.ctx.getPoint(evt.world, this.points.at(-1))); this.ctx.prompt.set({ message: `Spline: ${this.points.length} ponto(s). Enter finaliza.` }); }
  onMouseMove(evt) {
    if (!this.points.length) return;
    const controls = [...this.points, this.ctx.getPoint(evt.world, this.points.at(-1))];
    const ghost = new PolylineEntity({ geometry: { points: splinePoints(controls, 12), closed: false }, metadata: { layer: this.ctx.state.activeLayer } });
    this.setPreview([{ type: 'ghost-entity', entity: ghost }]);
  }
  commit() {
    if (this.points.length >= 2) this.ctx.addEntity(new PolylineEntity({ geometry: { points: splinePoints(this.points, 20), closed: false }, metadata: { layer: this.ctx.state.activeLayer, primitive: 'spline', controlPoints: this.points } }));
    this.points = []; this.clearPreview(); this.ctx.prompt.set({ message: 'Spline finalizada.' });
  }
  onDblClick() { this.commit(); }
  cancel() { this.points = []; this.clearPreview(); }
}

export class HatchTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'hatch'; this.pattern = 'ANSI31'; this.spacing = 8; this.angle = 45; }
  activate() {
    const p = String(window.prompt('Padrão de hachura: ANSI31, CROSS ou SOLID', this.pattern) || this.pattern).trim().toUpperCase();
    if (['ANSI31', 'CROSS', 'SOLID'].includes(p)) this.pattern = p;
    const spacing = promptNumber('Espaçamento da hachura (mm)', this.spacing, { min: 0.1 });
    if (spacing != null) this.spacing = spacing;
    const angle = promptNumber('Ângulo da hachura (graus)', this.angle);
    if (angle != null) this.angle = angle;
    this.ctx.prompt.set({ message: 'Hachura: clique em um retângulo, círculo ou polilinha fechada' });
  }
  onMouseDown(evt) {
    const entity = this.ctx.findEntityAt(evt.world);
    if (!entity || !this.ctx.isEntityEditable(entity)) return;
    const polygon = boundaryPolygon(entity);
    if (!polygon) { this.ctx.statusMessage = 'Hachura exige contorno fechado: retângulo, círculo ou polilinha fechada.'; this.ctx.render(); return; }
    const layer = this.ctx.state.activeLayer;
    const make = (angle, spacing) => hatchSegmentsForPolygon(polygon, angle, spacing).map((segment) => new LineEntity({
      geometry: { x1: segment.a.x, y1: segment.a.y, x2: segment.b.x, y2: segment.b.y },
      style: { opacity: this.pattern === 'SOLID' ? 0.65 : 0.8 },
      metadata: { layer, primitive: 'hatch', hatchPattern: this.pattern, hatchBoundaryId: entity.id },
    }));
    let lines = [];
    if (this.pattern === 'CROSS') lines = [...make(this.angle, this.spacing), ...make(this.angle + 90, this.spacing)];
    else if (this.pattern === 'SOLID') lines = [...make(this.angle, Math.max(0.8, this.spacing / 3)), ...make(this.angle + 90, Math.max(0.8, this.spacing / 3))];
    else lines = make(this.angle, this.spacing);
    if (!lines.length) { this.ctx.statusMessage = 'Não foi possível gerar a hachura neste contorno.'; this.ctx.render(); return; }
    this.ctx.addEntities(lines, `Hachura ${this.pattern} criada (${lines.length} linhas)`);
  }
}

export class ScaleTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'scale'; this.base = null; }
  activate() { this.base = null; this.ctx.prompt.set({ message: this.ctx.selection.ids.size ? 'Escala: informe o ponto base' : 'Escala: selecione objetos e informe o ponto base' }); }
  onMouseDown(evt) {
    if (!this.ctx.selection.ids.size) {
      const hit = this.ctx.findEntityAt(evt.world); if (hit && this.ctx.isEntityEditable(hit)) this.ctx.selection.set([hit.id]);
      return;
    }
    this.base = this.ctx.getPoint(evt.world);
    const factor = promptNumber('Fator de escala (ex.: 2 ou 0.5)', 1, { min: 0.000001, allowZero: false });
    if (factor == null) { this.base = null; return; }
    const selected = editableSelected(this.ctx);
    selected.forEach((entity) => replaceEntityGeometry(entity, scaleEntityGeometry(entity, this.base, factor)));
    if (selected.length) { this.ctx.pushHistory(); this.ctx.markDirty(`Escala ${factor} aplicada em ${selected.length} objeto(s)`); this.ctx.render(); }
    this.base = null;
  }
}

function gripCandidates(entity) {
  const g = entity.geometry || {};
  if (entity.type === 'line' || entity.type === 'centerline') return [
    { point: { x: g.x1, y: g.y1 }, apply: (p) => { g.x1 = p.x; g.y1 = p.y; } },
    { point: { x: g.x2, y: g.y2 }, apply: (p) => { g.x2 = p.x; g.y2 = p.y; } },
  ];
  if (entity.type === 'polyline') return (g.points || []).map((point, index) => ({ point, apply: (p) => { g.points[index] = { x: p.x, y: p.y }; } }));
  if (entity.type === 'rect') {
    const corners = [
      { x: g.x, y: g.y, key: 'tl' }, { x: g.x + g.width, y: g.y, key: 'tr' },
      { x: g.x + g.width, y: g.y + g.height, key: 'br' }, { x: g.x, y: g.y + g.height, key: 'bl' },
    ];
    return corners.map((corner) => ({ point: corner, apply: (p) => {
      const right = g.x + g.width; const bottom = g.y + g.height;
      if (corner.key === 'tl') { g.width = right - p.x; g.height = bottom - p.y; g.x = p.x; g.y = p.y; }
      if (corner.key === 'tr') { g.width = p.x - g.x; g.height = bottom - p.y; g.y = p.y; }
      if (corner.key === 'br') { g.width = p.x - g.x; g.height = p.y - g.y; }
      if (corner.key === 'bl') { g.width = right - p.x; g.x = p.x; g.height = p.y - g.y; }
    } }));
  }
  if (entity.type === 'circle') return [{ point: { x: g.cx + g.radius, y: g.cy }, apply: (p) => { g.radius = Math.max(0.001, Math.hypot(p.x - g.cx, p.y - g.cy)); } }];
  return [];
}

export class StretchTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'stretch'; this.grip = null; }
  activate() { this.grip = null; this.ctx.prompt.set({ message: 'Stretch: selecione objetos, clique em um grip e depois no novo ponto' }); }
  onMouseDown(evt) {
    if (!this.ctx.selection.ids.size) { const hit = this.ctx.findEntityAt(evt.world); if (hit && this.ctx.isEntityEditable(hit)) this.ctx.selection.set([hit.id]); return; }
    const world = this.ctx.getPoint(evt.world);
    if (!this.grip) {
      const tolerance = 14 / Math.max(0.001, this.ctx.viewport.getViewState().zoom);
      let best = null;
      editableSelected(this.ctx).forEach((entity) => gripCandidates(entity).forEach((grip) => {
        const distance = Math.hypot(grip.point.x - world.x, grip.point.y - world.y);
        if (distance <= tolerance && (!best || distance < best.distance)) best = { ...grip, entity, distance };
      }));
      if (!best) { this.ctx.statusMessage = 'Clique próximo a um grip/extremidade do objeto selecionado.'; this.ctx.render(); return; }
      this.grip = best; this.ctx.prompt.set({ message: 'Stretch: informe a nova posição do grip' }); return;
    }
    this.grip.apply(world);
    this.ctx.pushHistory(); this.ctx.markDirty('Stretch aplicado'); this.ctx.render();
    this.grip = null; this.ctx.prompt.set({ message: 'Stretch concluído. Selecione outro grip ou ESC.' });
  }
  cancel() { this.grip = null; }
}

export class BreakTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'break'; this.entity = null; this.p1 = null; }
  activate() { this.entity = null; this.p1 = null; this.ctx.prompt.set({ message: 'Break: selecione uma linha e informe dois pontos de quebra' }); }
  onMouseDown(evt) {
    if (!this.entity) {
      const hit = this.ctx.findEntityAt(evt.world);
      if (!hit || hit.type !== 'line' || !this.ctx.isEntityEditable(hit)) { this.ctx.statusMessage = 'Break nesta etapa trabalha com linhas retas.'; this.ctx.render(); return; }
      this.entity = hit; this.ctx.selection.set([hit.id]); this.ctx.prompt.set({ message: 'Break: informe o primeiro ponto' }); return;
    }
    const point = this.ctx.getPoint(evt.world);
    if (!this.p1) { this.p1 = point; this.ctx.prompt.set({ message: 'Break: informe o segundo ponto' }); return; }
    try {
      const parts = breakLineGeometry(this.entity.geometry, this.p1, point);
      const source = this.entity;
      removeEntities(this.ctx, [source.id]);
      const lines = parts.map((g) => new LineEntity({ geometry: g, style: { ...(source.style || {}) }, metadata: { ...(source.metadata || {}) } }));
      this.ctx.state.entities.push(...lines); this.ctx.pushHistory(); this.ctx.markDirty('Trecho removido com Break'); this.ctx.render();
    } catch (error) { this.ctx.statusMessage = error.message; this.ctx.render(); }
    this.entity = null; this.p1 = null; this.ctx.prompt.set({ message: 'Break concluído. Selecione outra linha ou ESC.' });
  }
  cancel() { this.entity = null; this.p1 = null; }
}

export class JoinTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'join'; }
  activate() { this.ctx.prompt.set({ message: 'Join: selecione linhas conectadas e pressione Enter' }); }
  onMouseDown(evt) { const hit = this.ctx.findEntityAt(evt.world); if (hit && hit.type === 'line' && this.ctx.isEntityEditable(hit)) this.ctx.selection.toggle(hit.id); }
  commit() {
    const selected = editableSelected(this.ctx).filter((entity) => entity.type === 'line');
    try {
      const joined = joinLineSegments(selected.map((e) => e.geometry));
      if (selected.length < 2) throw new Error('Selecione pelo menos duas linhas conectadas.');
      const metadata = { ...(selected[0].metadata || {}), primitive: 'joined' };
      removeEntities(this.ctx, selected.map((e) => e.id));
      this.ctx.state.entities.push(new PolylineEntity({ geometry: joined, metadata }));
      this.ctx.pushHistory(); this.ctx.markDirty(`Join concluído (${selected.length} segmentos)`); this.ctx.render();
    } catch (error) { this.ctx.statusMessage = error.message; this.ctx.render(); }
  }
}

export class ExplodeTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'explode'; }
  activate() { this.ctx.prompt.set({ message: 'Explode: selecione retângulos ou polilinhas e pressione Enter' }); }
  onMouseDown(evt) { const hit = this.ctx.findEntityAt(evt.world); if (hit && this.ctx.isEntityEditable(hit)) this.ctx.selection.toggle(hit.id); }
  commit() {
    const selected = editableSelected(this.ctx).filter((entity) => entity.type === 'rect' || entity.type === 'polyline');
    const created = [];
    selected.forEach((entity) => {
      let points = [];
      if (entity.type === 'rect') { const g = entity.geometry; points = [{ x: g.x, y: g.y }, { x: g.x + g.width, y: g.y }, { x: g.x + g.width, y: g.y + g.height }, { x: g.x, y: g.y + g.height }]; }
      else points = (entity.geometry.points || []).map((p) => ({ ...p }));
      for (let i = 0; i < points.length - 1; i += 1) created.push(new LineEntity({ geometry: { x1: points[i].x, y1: points[i].y, x2: points[i + 1].x, y2: points[i + 1].y }, style: { ...(entity.style || {}) }, metadata: { ...(entity.metadata || {}), primitive: 'exploded' } }));
      if ((entity.type === 'rect' || entity.geometry.closed) && points.length > 2) created.push(new LineEntity({ geometry: { x1: points.at(-1).x, y1: points.at(-1).y, x2: points[0].x, y2: points[0].y }, style: { ...(entity.style || {}) }, metadata: { ...(entity.metadata || {}), primitive: 'exploded' } }));
    });
    if (!created.length) { this.ctx.statusMessage = 'Selecione retângulo ou polilinha para explodir.'; this.ctx.render(); return; }
    removeEntities(this.ctx, selected.map((e) => e.id)); this.ctx.state.entities.push(...created);
    this.ctx.pushHistory(); this.ctx.markDirty(`Explode criou ${created.length} segmento(s)`); this.ctx.render();
  }
}

export class RectangularArrayTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'array_rect'; }
  activate() { this.ctx.prompt.set({ message: 'Array retangular: selecione objetos e pressione Enter' }); }
  onMouseDown(evt) { const hit = this.ctx.findEntityAt(evt.world); if (hit && this.ctx.isEntityEditable(hit)) this.ctx.selection.toggle(hit.id); }
  commit() {
    const selected = editableSelected(this.ctx);
    if (!selected.length) { this.ctx.statusMessage = 'Selecione pelo menos um objeto.'; this.ctx.render(); return; }
    const rows = Math.max(1, Math.round(promptNumber('Linhas do array', 2, { min: 1 }) || 1));
    const cols = Math.max(1, Math.round(promptNumber('Colunas do array', 3, { min: 1 }) || 1));
    const rowSpacing = promptNumber('Espaçamento entre linhas (mm)', 50) ?? 50;
    const colSpacing = promptNumber('Espaçamento entre colunas (mm)', 50) ?? 50;
    const created = [];
    rectangularArrayOffsets(rows, cols, rowSpacing, colSpacing).forEach(({ dx, dy }) => selected.forEach((entity) => { const clone = freshClone(entity); clone.move(dx, dy); created.push(clone); }));
    this.ctx.state.entities.push(...created); this.ctx.pushHistory(); this.ctx.markDirty(`Array retangular criou ${created.length} cópia(s)`); this.ctx.render();
  }
}

export class PolarArrayTool extends BaseTool {
  constructor(ctx) { super(ctx); this.name = 'array_polar'; this.center = null; }
  activate() { this.center = null; this.ctx.prompt.set({ message: 'Array circular: selecione objetos e informe o centro' }); }
  onMouseDown(evt) {
    if (!this.ctx.selection.ids.size) { const hit = this.ctx.findEntityAt(evt.world); if (hit && this.ctx.isEntityEditable(hit)) this.ctx.selection.set([hit.id]); return; }
    this.center = this.ctx.getPoint(evt.world);
    const count = Math.max(2, Math.round(promptNumber('Quantidade total de itens', 6, { min: 2 }) || 2));
    const totalAngle = promptNumber('Ângulo total do array (graus)', 360) ?? 360;
    const selected = editableSelected(this.ctx); const created = [];
    polarArrayAngles(count, totalAngle).forEach((angle) => selected.forEach((entity) => {
      let clone = freshClone(entity);
      const geometry = rotateEntityGeometry(clone, this.center, angle);
      if (geometry.__convertToPolyline) {
        clone = new PolylineEntity({ id: crypto.randomUUID(), geometry: { points: geometry.points, closed: true }, style: { ...(entity.style || {}) }, metadata: { ...(entity.metadata || {}) } });
      } else clone.geometry = geometry;
      created.push(clone);
    }));
    this.ctx.state.entities.push(...created); this.ctx.pushHistory(); this.ctx.markDirty(`Array circular criou ${created.length} cópia(s)`); this.ctx.render(); this.center = null;
  }
  cancel() { this.center = null; }
}
