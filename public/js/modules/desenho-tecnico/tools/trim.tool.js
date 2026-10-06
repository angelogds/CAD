import { BaseTool } from './base.tool.js';
import { lineIntersection } from './modify.utils.js';
import { ArcEntity } from '../entities/arc.entity.js';
import { angle2D, circleCircleIntersections, isAngleBetween } from '../core/geometry.js';
import { solveCircularTrimSegment } from '../core/modify.geometry.mjs?v=20261006-trim-v7';

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
      message: 'APARAR 1/3: clique no primeiro ponto de interseção que limita o trecho.',
    });
    this.ctx.statusMessage = 'APARAR: 1º clique = primeiro limite, 2º clique = segundo limite, 3º clique = trecho que deve desaparecer.';
    this.ctx.render?.();
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
    const tolerance = 18 / zoom;

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
          candidates.push({
            point,
            pair: [a, b],
            distance: Math.hypot(point.x - world.x, point.y - world.y),
          });
        });
      }
    }

    return candidates
      .filter((item) => item.distance <= tolerance)
      .sort((a, b) => a.distance - b.distance)[0] || null;
  }

  getTargetFromPair(world) {
    const pair = this.smartPair || [];
    const tolerance = 14 / Math.max(0.05, Number(this.ctx.viewport?.getViewState?.().zoom || 1));
    const hits = pair.filter((entity) => entity.hitTest?.(world, tolerance));
    if (!hits.length) return null;
    return hits.sort((a, b) => (
      Math.abs(Number(b.geometry?.radius || 0))
      - Math.abs(Number(a.geometry?.radius || 0))
    ))[0];
  }

  onMouseDown(evt) {
    if (this.smartFirst && this.smartSecond && this.smartPair) {
      this.commitCircularTrim(evt);
      return;
    }

    if (this.smartFirst && this.smartPair) {
      const second = this.findCircularIntersection(evt.world, this.smartPair, this.smartFirst.point);
      if (!second) {
        this.ctx.statusMessage = 'APARAR 2/3: clique no outro ponto de interseção do mesmo par de círculos.';
        this.ctx.render?.();
        return;
      }

      this.smartSecond = second;
      this.setPreview([
        { type: 'snap', point: this.smartFirst.point, kind: 'intersection' },
        { type: 'snap', point: second.point, kind: 'intersection' },
      ]);
      this.ctx.selection.set(this.smartPair.map((entity) => entity.id));
      this.ctx.prompt.set({
        message: 'APARAR 3/3: agora clique exatamente no trecho que deve desaparecer.',
      });
      this.ctx.statusMessage = 'APARAR: limites definidos. O terceiro clique escolhe somente o pedaço que será apagado.';
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
        this.ctx.statusMessage = 'APARAR: primeiro limite marcado.';
        this.ctx.render?.();
        return;
      }

      const hit = this.ctx.findEntityAt(evt.world);
      if (!hit || !this.ctx.isEntityEditable(hit)) {
        this.ctx.statusMessage = 'APARAR: clique no primeiro ponto de interseção.';
        this.ctx.render?.();
        return;
      }

      if (isCircular(hit)) {
        this.ctx.statusMessage = 'APARAR: para círculos e arcos, comece clicando no primeiro ponto de interseção.';
        this.ctx.render?.();
        return;
      }

      if (!['line', 'centerline'].includes(hit.type)) {
        this.ctx.statusMessage = 'APARAR: selecione um limite válido.';
        this.ctx.render?.();
        return;
      }

      this.boundary = hit;
      this.ctx.selection.set([hit.id]);
      this.ctx.prompt.set({ message: 'APARAR linear: clique na entidade e no lado que deve ser removido.' });
      this.ctx.render?.();
      return;
    }

    const hit = this.ctx.findEntityAt(evt.world);
    if (!hit || !this.ctx.isEntityEditable(hit) || !['line', 'centerline', 'polyline'].includes(hit.type) || hit.id === this.boundary.id) return;

    if (this.trimLinear(hit, evt.world)) {
      this.ctx.pushHistory();
      this.ctx.markDirty('Aparar aplicado');
      this.ctx.render();
    }

    this.reset(false);
    this.ctx.prompt.set({ message: 'APARAR: clique no primeiro ponto de uma nova operação.' });
  }

  commitCircularTrim(evt) {
    const target = this.getTargetFromPair(evt.world);
    if (!target) {
      this.ctx.statusMessage = 'APARAR 3/3: clique diretamente no trecho circular que deve desaparecer.';
      this.ctx.render?.();
      return;
    }

    const solved = solveCircularTrimSegment(
      target.geometry,
      this.smartFirst.point,
      this.smartSecond.point,
      evt.world,
    );

    if (!solved.ok) {
      this.ctx.statusMessage = `APARAR: ${solved.error}`;
      this.ctx.render?.();
      return;
    }

    const keptArcs = solved.keptArcs.map((geometry, index) => new ArcEntity({
      ...(index === 0 ? { id: target.id } : {}),
      geometry,
      style: { ...(target.style || {}) },
      metadata: { ...(target.metadata || {}) },
      visible: target.visible !== false,
    }));

    this.ctx.state.entities = this.ctx.state.entities.filter((entity) => String(entity.id) !== String(target.id));
    this.ctx.state.entities.push(...keptArcs);
    this.ctx.pushHistory();
    this.ctx.markDirty('Aparar: trecho circular removido');
    this.ctx.preview.clear();
    this.reset(false);
    this.ctx.prompt.set({ message: 'APARAR concluído. Clique no primeiro ponto da próxima operação.' });
    this.ctx.statusMessage = 'APARAR concluído: somente o trecho do terceiro clique foi apagado; o restante foi preservado.';
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
      const base = [
        { type: 'snap', point: this.smartFirst.point, kind: 'intersection' },
        { type: 'snap', point: this.smartSecond.point, kind: 'intersection' },
      ];

      if (isCircular(target)) {
        const solved = solveCircularTrimSegment(
          target.geometry,
          this.smartFirst.point,
          this.smartSecond.point,
          evt.world,
        );

        if (solved.ok) {
          const ghosts = solved.keptArcs.map((geometry) => ({
            type: 'ghost-entity',
            entity: new ArcEntity({
              geometry,
              style: target.style,
              metadata: target.metadata,
            }),
          }));
          this.setPreview([...base, ...ghosts]);
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
    if (this.trimLinear(ghost, evt.world)) {
      this.ctx.preview.set([{ type: 'ghost-entity', entity: ghost }]);
    }
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
      if (d1 < d2) {
        entity.geometry.x1 = i.x;
        entity.geometry.y1 = i.y;
      } else {
        entity.geometry.x2 = i.x;
        entity.geometry.y2 = i.y;
      }
      return true;
    }

    if (entity.type === 'polyline') {
      const pts = entity.geometry.points || [];
      if (pts.length < 2) return false;

      const i0 = lineIntersection(pts[0], pts[1], b1, b2, { segmentA: true, segmentB: true });
      const il = lineIntersection(
        pts[pts.length - 2],
        pts[pts.length - 1],
        b1,
        b2,
        { segmentA: true, segmentB: true },
      );
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
