import { BaseTool } from './base.tool.js';
import { lineIntersection } from './modify.utils.js';
import { ArcEntity } from '../entities/arc.entity.js';
import { angle2D, circleCircleIntersections, isAngleBetween } from '../core/geometry.js';
import { solveCircularRecess } from '../core/modify.geometry.mjs';

function isCircular(entity) {
  return Boolean(entity && ['circle', 'arc'].includes(entity.type));
}

function pointAllowedByArc(entity, point) {
  if (entity.type !== 'arc') return true;
  return isAngleBetween(
    angle2D({ x: entity.geometry.cx, y: entity.geometry.cy }, point),
    entity.geometry.startAngle,
    entity.geometry.endAngle,
    entity.geometry.ccw !== false,
  );
}

export class TrimTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'trim';
    this.boundary = null;
    this.smartFirst = null;
    this.smartSecond = null;
    this.smartPair = null;
  }

  activate() {
    this.reset(false);
    this.ctx.prompt.set({
      message: 'APARAR: clique no 1º ponto de interseção do rebaixo, ou selecione uma linha limite para o trim simples.',
    });
  }

  getCircularEntities() {
    return (this.ctx.state.entities || []).filter((entity) => (
      isCircular(entity)
      && this.ctx.isEntityEditable(entity)
    ));
  }

  intersectionsForPair(a, b) {
    if (!isCircular(a) || !isCircular(b)) return [];
    const points = circleCircleIntersections(
      { x: a.geometry.cx, y: a.geometry.cy },
      a.geometry.radius,
      { x: b.geometry.cx, y: b.geometry.cy },
      b.geometry.radius,
    );
    return points.filter((point) => pointAllowedByArc(a, point) && pointAllowedByArc(b, point));
  }

  findCircularIntersection(world, pair = null, exclude = null) {
    const entities = this.getCircularEntities();
    const candidates = [];
    const zoom = Math.max(0.05, Number(this.ctx.viewport?.getViewState?.().zoom || 1));
    const tolerance = 14 / zoom;

    for (let i = 0; i < entities.length; i += 1) {
      for (let j = i + 1; j < entities.length; j += 1) {
        const a = entities[i];
        const b = entities[j];
        if (pair) {
          const ids = new Set(pair.map((entity) => String(entity.id)));
          if (!ids.has(String(a.id)) || !ids.has(String(b.id))) continue;
        }
        this.intersectionsForPair(a, b).forEach((point) => {
          if (exclude && Math.hypot(point.x - exclude.x, point.y - exclude.y) <= tolerance * 0.35) return;
          candidates.push({ point, pair: [a, b], distance: Math.hypot(point.x - world.x, point.y - world.y) });
        });
      }
    }

    return candidates
      .filter((item) => item.distance <= tolerance)
      .sort((a, b) => a.distance - b.distance)[0] || null;
  }

  getTargetFromPair(world) {
    const pair = this.smartPair || [];
    return pair.find((entity) => entity.hitTest?.(world, 8 / Math.max(0.05, Number(this.ctx.viewport?.getViewState?.().zoom || 1)))) || null;
  }

  onMouseDown(evt) {
    if (this.smartFirst && this.smartSecond && this.smartPair) {
      this.commitCircularRecess(evt);
      return;
    }

    if (this.smartFirst && this.smartPair) {
      const second = this.findCircularIntersection(evt.world, this.smartPair, this.smartFirst.point);
      if (!second) {
        this.ctx.statusMessage = 'APARAR: clique no segundo ponto de interseção do mesmo par de círculos.';
        this.ctx.render?.();
        return;
      }
      this.smartSecond = second;
      this.setPreview([
        { type: 'snap', point: this.smartFirst.point, kind: 'intersection' },
        { type: 'snap', point: second.point, kind: 'intersection' },
      ]);
      this.ctx.selection.set(this.smartPair.map((entity) => entity.id));
      this.ctx.prompt.set({ message: 'APARAR 3/3: clique no trecho do círculo azul que deve ser removido.' });
      this.ctx.statusMessage = 'APARAR: dois limites definidos. Agora escolha o trecho a apagar.';
      this.ctx.render?.();
      return;
    }

    if (!this.boundary) {
      const smart = this.findCircularIntersection(evt.world);
      if (smart) {
        this.smartFirst = smart;
        this.smartPair = smart.pair;
        this.ctx.selection.set(this.smartPair.map((entity) => entity.id));
        this.setPreview([{ type: 'snap', point: smart.point, kind: 'intersection' }]);
        this.ctx.prompt.set({ message: 'APARAR 2/3: clique no segundo ponto de interseção.' });
        this.ctx.statusMessage = 'APARAR: primeiro ponto de interseção marcado.';
        this.ctx.render?.();
        return;
      }

      const hit = this.ctx.findEntityAt(evt.world);
      if (!hit || !this.ctx.isEntityEditable(hit) || !['line', 'centerline'].includes(hit.type)) {
        this.ctx.statusMessage = 'APARAR: selecione uma interseção circular ou uma linha limite.';
        this.ctx.render?.();
        return;
      }
      this.boundary = hit;
      this.ctx.selection.set([hit.id]);
      this.ctx.prompt.set({ message: 'TRIM simples: selecione a entidade a ser cortada (lado pelo clique).' });
      this.ctx.render?.();
      return;
    }

    const hit = this.ctx.findEntityAt(evt.world);
    if (!hit || !this.ctx.isEntityEditable(hit) || !['line', 'centerline', 'polyline'].includes(hit.type) || hit.id === this.boundary.id) return;
    if (this.trimLinear(hit, evt.world)) {
      this.ctx.pushHistory();
      this.ctx.markDirty('Trim aplicado');
      this.ctx.render();
    }
    this.reset(false);
    this.ctx.prompt.set({ message: 'APARAR: clique em uma nova interseção ou selecione outra linha limite.' });
  }

  commitCircularRecess(evt) {
    const target = this.getTargetFromPair(evt.world);
    if (!target) {
      this.ctx.statusMessage = 'APARAR: clique diretamente no trecho circular que deseja remover.';
      this.ctx.render?.();
      return;
    }
    const cutter = this.smartPair.find((entity) => entity.id !== target.id);
    if (!target || !cutter || !isCircular(target) || cutter.type !== 'circle') {
      this.ctx.statusMessage = 'APARAR: selecione o contorno circular/arcado e um círculo auxiliar de rebaixo.';
      this.ctx.render?.();
      return;
    }

    const solved = solveCircularRecess(target.geometry, cutter.geometry, evt.world);
    if (!solved.ok) {
      this.ctx.statusMessage = `APARAR: ${solved.error}`;
      this.ctx.render?.();
      return;
    }

    const targetArcs = solved.targetArcs.map((geometry, index) => new ArcEntity({
      ...(index === 0 ? { id: target.id } : {}),
      geometry,
      style: { ...(target.style || {}) },
      metadata: { ...(target.metadata || {}) },
      visible: target.visible !== false,
    }));
    const recessArc = new ArcEntity({
      id: cutter.id,
      geometry: solved.recessArc,
      style: { ...(target.style || {}) },
      metadata: {
        ...(cutter.metadata || {}),
        ...(target.metadata || {}),
        layer: target.metadata?.layer || this.ctx.state.activeLayer,
        trimSource: cutter.id,
      },
      visible: true,
    });

    const removeIds = new Set([String(target.id), String(cutter.id)]);
    this.ctx.state.entities = this.ctx.state.entities.filter((entity) => !removeIds.has(String(entity.id)));
    this.ctx.state.entities.push(...targetArcs, recessArc);
    this.ctx.selection.set([...targetArcs.map((entity) => entity.id), recessArc.id]);
    this.ctx.pushHistory();
    this.ctx.markDirty('Aparar: rebaixo circular criado');
    this.ctx.preview.clear();
    this.ctx.statusMessage = 'APARAR concluído: trecho externo removido e arco do rebaixo incorporado ao contorno.';
    this.reset(false);
    this.ctx.prompt.set({ message: 'APARAR concluído. Clique no 1º ponto de outra interseção ou pressione ESC.' });
    this.ctx.render();
  }

  onMouseMove(evt) {
    if (this.smartFirst && !this.smartSecond && this.smartPair) {
      const second = this.findCircularIntersection(evt.world, this.smartPair, this.smartFirst.point);
      const preview = [{ type: 'snap', point: this.smartFirst.point, kind: 'intersection' }];
      if (second) preview.push({ type: 'snap', point: second.point, kind: 'intersection' });
      this.setPreview(preview);
      return;
    }

    if (this.smartFirst && this.smartSecond && this.smartPair) {
      const target = this.getTargetFromPair(evt.world);
      const cutter = target && this.smartPair.find((entity) => entity.id !== target.id);
      const base = [
        { type: 'snap', point: this.smartFirst.point, kind: 'intersection' },
        { type: 'snap', point: this.smartSecond.point, kind: 'intersection' },
      ];
      if (isCircular(target) && cutter?.type === 'circle') {
        const solved = solveCircularRecess(target.geometry, cutter.geometry, evt.world);
        if (solved.ok) {
          const targetGhosts = solved.targetArcs.map((geometry) => ({
            type: 'ghost-entity',
            entity: new ArcEntity({ geometry, style: target.style, metadata: target.metadata }),
          }));
          const recessGhost = new ArcEntity({ geometry: solved.recessArc, style: target.style, metadata: target.metadata });
          this.setPreview([...base, ...targetGhosts, { type: 'ghost-entity', entity: recessGhost }]);
          return;
        }
      }
      this.setPreview(base);
      return;
    }

    if (!this.boundary) return;
    const hit = this.ctx.findEntityAt(evt.world);
    if (!hit || !['line', 'centerline', 'polyline'].includes(hit.type) || hit.id === this.boundary.id) {
      this.ctx.preview.clear();
      return;
    }
    const ghost = hit.clone();
    if (this.trimLinear(ghost, evt.world)) this.ctx.preview.set([{ type: 'ghost-entity', entity: ghost }]);
  }

  trimLinear(entity, clickPoint) {
    const b1 = { x: this.boundary.geometry.x1, y: this.boundary.geometry.y1 };
    const b2 = { x: this.boundary.geometry.x2, y: this.boundary.geometry.y2 };
    if (entity.type === 'line' || entity.type === 'centerline') {
      const a1 = { x: entity.geometry.x1, y: entity.geometry.y1 };
      const a2 = { x: entity.geometry.x2, y: entity.geometry.y2 };
      const i = lineIntersection(a1, a2, b1, b2, { segmentA: true, segmentB: true });
      if (!i) return false;
      const d1 = Math.hypot(clickPoint.x - a1.x, clickPoint.y - a1.y);
      const d2 = Math.hypot(clickPoint.x - a2.x, clickPoint.y - a2.y);
      if (d1 < d2) { entity.geometry.x1 = i.x; entity.geometry.y1 = i.y; } else { entity.geometry.x2 = i.x; entity.geometry.y2 = i.y; }
      return true;
    }
    if (entity.type === 'polyline') {
      const pts = entity.geometry.points || [];
      if (pts.length < 2) return false;
      const i0 = lineIntersection(pts[0], pts[1], b1, b2, { segmentA: true, segmentB: true });
      const il = lineIntersection(pts[pts.length - 2], pts[pts.length - 1], b1, b2, { segmentA: true, segmentB: true });
      const d0 = Math.hypot(clickPoint.x - pts[0].x, clickPoint.y - pts[0].y);
      const dl = Math.hypot(clickPoint.x - pts[pts.length - 1].x, clickPoint.y - pts[pts.length - 1].y);
      if (d0 < dl && i0) pts[0] = i0;
      else if (il) pts[pts.length - 1] = il;
      return Boolean(i0 || il);
    }
    return false;
  }

  reset(render = true) {
    this.boundary = null;
    this.smartFirst = null;
    this.smartSecond = null;
    this.smartPair = null;
    this.ctx.preview.clear();
    this.ctx.selection.clear?.();
    if (render) this.ctx.render?.();
  }

  deactivate() { this.reset(false); }
  cancel() { this.reset(true); }
}
