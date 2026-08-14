import { BaseTool } from './base.tool.js';
import { CircleEntity } from '../entities/circle.entity.js';
import { LineEntity } from '../entities/line.entity.js';
import { createFlangeGeometry, normalizeFlangeParameters } from '../core/flange.factory.js';

const entityFromDefinition = (definition) => {
  const payload = {
    geometry: definition.geometry,
    metadata: definition.metadata,
    style: definition.style || {},
  };
  if (definition.type === 'circle') return new CircleEntity(payload);
  return new LineEntity({ ...payload, type: definition.type });
};

export class FlangeTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'flange';
    this.parameters = null;
    this.modal = null;
    this.form = null;
    this.isBound = false;
  }

  activate() {
    this.parameters = null;
    this.clearPreview();
    this.openModal();
  }

  deactivate() {
    this.hideModal();
    this.clearPreview();
  }

  openModal() {
    this.modal = document.getElementById('cadFlangeModal');
    this.form = document.getElementById('cadFlangeForm');
    if (!this.modal || !this.form) {
      this.ctx.statusMessage = 'Formulário do flange indisponível.';
      return;
    }
    this.bindModal();
    const error = this.modal.querySelector('[data-flange-error]');
    if (error) error.textContent = '';
    this.modal.hidden = false;
    this.form.querySelector('[name="outerDiameter"]')?.focus();
    this.ctx.prompt.set({ message: 'Configure as medidas exatas do flange.' });
  }

  bindModal() {
    if (this.isBound) return;
    this.isBound = true;
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(this.form).entries());
      try {
        this.parameters = normalizeFlangeParameters(values);
        this.hideModal();
        this.ctx.prompt.set({ message: 'Flange configurado: clique no ponto central para posicionar.' });
        this.ctx.statusMessage = `Flange Ø${this.parameters.outerDiameter} • ${this.parameters.holeCount} furos Ø${this.parameters.holeDiameter}`;
        this.ctx.render();
      } catch (error) {
        const message = this.modal.querySelector('[data-flange-error]');
        if (message) message.textContent = error.message;
      }
    });
    this.modal.querySelectorAll('[data-flange-close]').forEach((button) => button.addEventListener('click', () => {
      this.parameters = null;
      this.hideModal();
      this.ctx.toolManager.set('select');
      this.ctx.render();
    }));
  }

  hideModal() {
    if (this.modal) this.modal.hidden = true;
  }

  onMouseMove(evt) {
    if (!this.parameters) return;
    const center = this.ctx.getPoint(evt.world);
    const flange = createFlangeGeometry(this.parameters, center, { groupId: 'flange-preview' });
    this.setPreview(flange.objects.map((definition) => ({
      type: 'ghost-entity',
      entity: { type: definition.type, geometry: definition.geometry },
    })));
  }

  onMouseDown(evt) {
    if (!this.parameters) return;
    const center = this.ctx.getPoint(evt.world);
    const flange = createFlangeGeometry(this.parameters, center, { groupId: crypto.randomUUID() });
    this.ctx.addEntities(flange.objects.map(entityFromDefinition), `Flange criado com ${flange.parameters.holeCount} furos`);
    this.parameters = null;
    this.clearPreview();
    this.ctx.toolManager.set('select');
    this.ctx.render();
  }

  cancel() {
    this.parameters = null;
    this.hideModal();
    this.clearPreview();
  }
}
