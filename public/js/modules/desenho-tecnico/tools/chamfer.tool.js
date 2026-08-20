import { BaseTool } from './base.tool.js';
import { LineEntity } from '../entities/line.entity.js';
import { solveChamfer } from '../core/modify.geometry.mjs';

function parseDistances(raw) {
  const parts = String(raw || '').trim().split(/[;\s]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return { d1: parts[0], d2: parts[1] || parts[0] };
}

export class ChamferTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'chamfer';
    this.first = null;
    this.second = null;
    this.distances = { d1: 10, d2: 10 };
  }

  activate() {
    this.reset(false);
    this.ctx.prompt.set({ message: 'CHAMFER: selecione a primeira linha do canto.' });
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
      this.ctx.statusMessage = 'CHAMFER: selecione uma linha reta editável.';
      this.ctx.render?.();
      return;
    }

    if (!this.first) {
      this.first = picked;
      this.ctx.selection.set([picked.entity.id]);
      this.ctx.prompt.set({ message: 'CHAMFER: selecione a segunda linha do canto.' });
      this.ctx.statusMessage = 'CHAMFER: primeira linha selecionada.';
      this.ctx.render?.();
      return;
    }

    if (picked.entity.id === this.first.entity.id) {
      this.ctx.statusMessage = 'CHAMFER: selecione uma segunda linha diferente.';
      this.ctx.render?.();
      return;
    }

    this.second = picked;
    this.ctx.selection.set([this.first.entity.id, this.second.entity.id]);
    this.openDistanceInput(evt.screen);
  }

  openDistanceInput(screen) {
    this.distances = { d1: 10, d2: 10 };
    this.updatePreview(this.distances);
    this.ctx.prompt.set({ message: 'CHAMFER: informe distância em mm (ex.: 10) ou duas distâncias (ex.: 10;15) e pressione Enter.' });
    this.ctx.showDynamicInput?.({
      x: (screen?.x || 12) + 12,
      y: (screen?.y || 12) + 12,
      value: '10.000',
      onChange: (raw) => {
        const parsed = parseDistances(raw);
        if (!parsed) return;
        this.distances = parsed;
        this.updatePreview(parsed);
      },
      onConfirm: (raw) => {
        const parsed = parseDistances(raw);
        if (!parsed) {
          this.ctx.statusMessage = 'CHAMFER: use um valor positivo ou dois valores separados por ponto e vírgula.';
          this.ctx.render?.();
          return false;
        }
        return this.commitDistances(parsed);
      },
      onCancel: () => this.cancel(),
    });
    queueMicrotask(() => document.querySelector('#cadDynamicInput .cad-dyn-value')?.click());
  }

  solve(distances) {
    if (!this.first || !this.second) return { ok: false, error: 'Selecione duas linhas.' };
    return solveChamfer(
      this.first.entity.geometry,
      this.first.pick,
      this.second.entity.geometry,
      this.second.pick,
      distances.d1,
      distances.d2,
    );
  }

  previewEntity(entity, geometry) {
    const copy = entity.clone();
    copy.id = entity.id;
    copy.geometry = geometry;
    return copy;
  }

  updatePreview(distances) {
    const solved = this.solve(distances);
    if (!solved.ok) {
      this.clearPreview();
      this.ctx.statusMessage = `CHAMFER: ${solved.error}`;
      this.ctx.render?.();
      return false;
    }

    const connector = new LineEntity({
      geometry: solved.chamfer,
      style: { ...(this.first.entity.style || {}) },
      metadata: { ...(this.first.entity.metadata || {}) },
    });
    this.setPreview([
      { type: 'ghost-entity', entity: this.previewEntity(this.first.entity, solved.line1) },
      { type: 'ghost-entity', entity: this.previewEntity(this.second.entity, solved.line2) },
      { type: 'ghost-entity', entity: connector },
    ]);
    this.ctx.statusMessage = `CHAMFER: ${distances.d1.toFixed(3)} / ${distances.d2.toFixed(3)} mm • geometria válida.`;
    this.ctx.render?.();
    return true;
  }

  commitDistances(distances) {
    const solved = this.solve(distances);
    if (!solved.ok) {
      this.ctx.statusMessage = `CHAMFER: ${solved.error}`;
      this.ctx.render?.();
      return false;
    }

    this.first.entity.geometry = solved.line1;
    this.second.entity.geometry = solved.line2;
    const connector = new LineEntity({
      geometry: solved.chamfer,
      style: { ...(this.first.entity.style || {}) },
      metadata: { ...(this.first.entity.metadata || {}) },
    });
    this.ctx.state.entities.push(connector);
    this.ctx.selection.set([connector.id]);
    this.ctx.pushHistory?.();
    this.ctx.markDirty?.(`CHAMFER ${distances.d1.toFixed(3)}/${distances.d2.toFixed(3)} aplicado`);
    this.clearPreview();
    this.ctx.hideDynamicInput?.();
    this.ctx.statusMessage = `CHAMFER concluído • ${distances.d1.toFixed(3)} / ${distances.d2.toFixed(3)} mm.`;
    this.first = null;
    this.second = null;
    this.distances = distances;
    this.ctx.prompt.set({ message: 'CHAMFER concluído. Selecione a primeira linha de outro canto ou pressione ESC.' });
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
