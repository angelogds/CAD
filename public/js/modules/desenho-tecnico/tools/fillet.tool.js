import { BaseTool } from './base.tool.js';
import { ArcEntity } from '../entities/arc.entity.js';
import { solveFillet } from '../core/modify.geometry.mjs';

export class FilletTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'fillet';
    this.first = null;
    this.second = null;
    this.radius = 10;
  }

  activate() {
    this.reset(false);
    this.ctx.prompt.set({ message: 'FILLET: selecione a primeira linha do canto.' });
  }

  pickLine(evt) {
    const hit = this.ctx.findEntityAt(evt.world);
    if (!hit || hit.type !== 'line' || !this.ctx.isEntityEditable(hit)) return null;
    return { entity: hit, pick: { x: evt.world.x, y: evt.world.y } };
  }

  onMouseDown(evt) {
    if (this.second) return;
    const picked = this.pickLine(evt);
    if (!picked) {
      this.ctx.statusMessage = 'FILLET: selecione uma linha reta editável.';
      this.ctx.render?.();
      return;
    }

    if (!this.first) {
      this.first = picked;
      this.ctx.selection.set([picked.entity.id]);
      this.ctx.prompt.set({ message: 'FILLET: selecione a segunda linha do canto.' });
      this.ctx.statusMessage = 'FILLET: primeira linha selecionada.';
      this.ctx.render?.();
      return;
    }

    if (picked.entity.id === this.first.entity.id) {
      this.ctx.statusMessage = 'FILLET: selecione uma segunda linha diferente.';
      this.ctx.render?.();
      return;
    }

    this.second = picked;
    this.ctx.selection.set([this.first.entity.id, this.second.entity.id]);
    this.openRadiusInput(evt.screen);
  }

  openRadiusInput(screen) {
    this.radius = 10;
    this.updatePreview(this.radius);
    this.ctx.prompt.set({ message: 'FILLET: informe o raio em mm e pressione Enter.' });
    this.ctx.showDynamicInput?.({
      x: (screen?.x || 12) + 12,
      y: (screen?.y || 12) + 12,
      value: this.radius.toFixed(3),
      onChange: (raw) => {
        const radius = Number(raw);
        if (!Number.isFinite(radius) || radius <= 0) return;
        this.radius = radius;
        this.updatePreview(radius);
      },
      onConfirm: (raw) => this.commitRadius(Number(raw)),
      onCancel: () => this.cancel(),
    });
    queueMicrotask(() => document.querySelector('#cadDynamicInput .cad-dyn-value')?.click());
  }

  solve(radius) {
    if (!this.first || !this.second) return { ok: false, error: 'Selecione duas linhas.' };
    return solveFillet(
      this.first.entity.geometry,
      this.first.pick,
      this.second.entity.geometry,
      this.second.pick,
      radius,
    );
  }

  previewEntity(entity, geometry) {
    const copy = entity.clone();
    copy.id = entity.id;
    copy.geometry = geometry;
    return copy;
  }

  updatePreview(radius) {
    const solved = this.solve(radius);
    if (!solved.ok) {
      this.clearPreview();
      this.ctx.statusMessage = `FILLET: ${solved.error}`;
      this.ctx.render?.();
      return false;
    }

    const arc = new ArcEntity({
      geometry: solved.arc,
      style: { ...(this.first.entity.style || {}) },
      metadata: { ...(this.first.entity.metadata || {}) },
    });
    this.setPreview([
      { type: 'ghost-entity', entity: this.previewEntity(this.first.entity, solved.line1) },
      { type: 'ghost-entity', entity: this.previewEntity(this.second.entity, solved.line2) },
      { type: 'ghost-entity', entity: arc },
    ]);
    this.ctx.statusMessage = `FILLET: raio ${Number(radius).toFixed(3)} mm • tangência válida.`;
    this.ctx.render?.();
    return true;
  }

  commitRadius(radius) {
    if (!Number.isFinite(radius) || radius <= 0) {
      this.ctx.statusMessage = 'FILLET: informe um raio maior que zero.';
      this.ctx.render?.();
      return false;
    }

    const solved = this.solve(radius);
    if (!solved.ok) {
      this.ctx.statusMessage = `FILLET: ${solved.error}`;
      this.ctx.render?.();
      return false;
    }

    this.first.entity.geometry = solved.line1;
    this.second.entity.geometry = solved.line2;
    const arc = new ArcEntity({
      geometry: solved.arc,
      style: { ...(this.first.entity.style || {}) },
      metadata: { ...(this.first.entity.metadata || {}) },
    });
    this.ctx.state.entities.push(arc);
    this.ctx.selection.set([arc.id]);
    this.ctx.pushHistory?.();
    this.ctx.markDirty?.(`FILLET R${radius.toFixed(3)} aplicado`);
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
    this.ctx.statusMessage = `FILLET concluído • R ${radius.toFixed(3)} mm.`;
    this.first = null;
    this.second = null;
    this.radius = radius;
    this.ctx.prompt.set({ message: 'FILLET concluído. Selecione a primeira linha de outro canto ou pressione ESC.' });
    this.ctx.render?.();
    return true;
  }

  reset(render = true) {
    this.first = null;
    this.second = null;
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
    if (render) this.ctx.render?.();
  }

  cancel() {
    this.reset(true);
  }
}
