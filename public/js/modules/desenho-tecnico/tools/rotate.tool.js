import { BaseTool } from './base.tool.js';
import { PolylineEntity } from '../entities/polyline.entity.js';
import { rotateEntitySnapshot } from '../core/modify.geometry.mjs';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export class RotateTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'rotate';
    this.basePoint = null;
    this.currentAngle = 0;
  }

  activate() {
    this.basePoint = null;
    this.currentAngle = 0;
    this.ctx.hideDynamicInput?.();
    this.ctx.prompt.set({
      message: this.ctx.selection.ids.size
        ? 'ROTATE: informe o ponto base da rotação'
        : 'ROTATE: selecione um ou mais objetos e informe o ponto base',
    });
  }

  selectedEntities() {
    return this.ctx.state.entities.filter((entity) => this.ctx.selection.includes(entity.id) && this.ctx.isEntityEditable(entity));
  }

  makeRotatedEntity(entity, angleRad) {
    const solved = rotateEntitySnapshot(entity.type, entity.geometry, this.basePoint, angleRad);
    if (!solved.ok) return { ok: false, error: solved.error, entity };

    if (solved.type === 'polyline' && entity.type === 'rect') {
      const basePoints = Array.isArray(solved.geometry.points) ? solved.geometry.points : [];
      const points = basePoints.length ? [...basePoints, { ...basePoints[0] }] : basePoints;
      return {
        ok: true,
        replacement: new PolylineEntity({
          id: entity.id,
          geometry: { ...solved.geometry, points, closed: true },
          style: { ...(entity.style || {}) },
          visible: entity.visible !== false,
          metadata: { ...(entity.metadata || {}) },
        }),
      };
    }

    const replacement = entity.clone();
    replacement.id = entity.id;
    replacement.geometry = solved.geometry;
    return { ok: true, replacement };
  }

  showAngleInput(screen) {
    this.ctx.showDynamicInput?.({
      x: (screen?.x || 12) + 12,
      y: (screen?.y || 12) + 12,
      value: '0.00',
      onChange: (raw) => {
        const degrees = Number(raw);
        if (!Number.isFinite(degrees)) return;
        this.currentAngle = degrees * RAD;
        this.updatePreview(this.currentAngle);
      },
      onConfirm: (raw) => {
        const degrees = Number(raw);
        if (!Number.isFinite(degrees)) {
          this.ctx.statusMessage = 'ROTATE: informe um ângulo numérico em graus.';
          this.ctx.render?.();
          return false;
        }
        return this.applyAngle(degrees * RAD);
      },
      onCancel: () => this.cancel(),
    });
  }

  onMouseDown(evt) {
    if (!this.ctx.selection.ids.size) {
      const hit = this.ctx.findEntityAt(evt.world);
      if (hit && this.ctx.isEntityEditable(hit)) {
        this.ctx.selection.set([hit.id]);
        this.ctx.prompt.set({ message: 'ROTATE: objeto selecionado. Informe o ponto base.' });
      }
      return;
    }

    const point = this.ctx.getPoint(evt.world, this.basePoint);
    if (!this.basePoint) {
      this.basePoint = point;
      this.currentAngle = 0;
      this.ctx.prompt.set({ message: 'ROTATE: indique o ângulo com o cursor ou clique no valor para digitar graus exatos.' });
      this.showAngleInput(evt.screen);
      return;
    }

    const angle = Math.atan2(point.y - this.basePoint.y, point.x - this.basePoint.x);
    this.applyAngle(angle);
  }

  onMouseMove(evt) {
    if (!this.basePoint) return;
    const point = this.ctx.getPoint(evt.world, this.basePoint);
    this.currentAngle = Math.atan2(point.y - this.basePoint.y, point.x - this.basePoint.x);
    this.updatePreview(this.currentAngle);
    const valueButton = document.querySelector('#cadDynamicInput .cad-dyn-value');
    const input = document.querySelector('#cadDynamicInput .cad-dyn-input');
    if (valueButton && input?.style.display === 'none') valueButton.textContent = `${(this.currentAngle * DEG).toFixed(2)}°`;
    this.ctx.statusMessage = `ROTATE: ${(this.currentAngle * DEG).toFixed(3)}°`;
  }

  updatePreview(angleRad) {
    const preview = [];
    let unsupported = 0;
    this.selectedEntities().forEach((entity) => {
      const result = this.makeRotatedEntity(entity, angleRad);
      if (!result.ok) {
        unsupported += 1;
        return;
      }
      preview.push({ type: 'ghost-entity', entity: result.replacement });
    });
    this.setPreview(preview);
    if (unsupported) this.ctx.statusMessage = `ROTATE: ${unsupported} objeto(s) não suportam rotação livre.`;
    this.ctx.render?.();
  }

  applyAngle(angleRad) {
    if (!this.basePoint || !Number.isFinite(Number(angleRad))) return false;
    if (Math.abs(angleRad) < 1e-12) {
      this.finish('ROTATE: ângulo 0°. Nenhuma alteração aplicada.');
      return true;
    }

    const selectedIds = new Set(this.ctx.selection.ids);
    const replacements = new Map();
    const errors = [];
    this.selectedEntities().forEach((entity) => {
      const result = this.makeRotatedEntity(entity, angleRad);
      if (!result.ok) errors.push(result.error);
      else replacements.set(entity.id, result.replacement);
    });

    if (!replacements.size) {
      this.ctx.statusMessage = errors[0] || 'ROTATE: nenhum objeto compatível selecionado.';
      this.ctx.render?.();
      return false;
    }

    this.ctx.state.entities = this.ctx.state.entities.map((entity) => replacements.get(entity.id) || entity);
    this.ctx.selection.set(Array.from(selectedIds).filter((id) => this.ctx.state.entities.some((entity) => entity.id === id)));
    this.ctx.pushHistory?.();
    const degrees = angleRad * DEG;
    const skipped = errors.length;
    this.ctx.markDirty?.(`Rotação aplicada em ${replacements.size} objeto(s)`);
    this.finish(`ROTATE: ${replacements.size} objeto(s) girado(s) ${degrees.toFixed(3)}°${skipped ? ` • ${skipped} ignorado(s)` : ''}.`);
    return true;
  }

  finish(message) {
    this.basePoint = null;
    this.currentAngle = 0;
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
    this.ctx.statusMessage = message;
    this.ctx.prompt.set({ message: 'ROTATE concluído. Selecione outro conjunto ou pressione ESC.' });
    this.ctx.render?.();
  }

  cancel() {
    this.basePoint = null;
    this.currentAngle = 0;
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
    this.ctx.render?.();
  }
}
