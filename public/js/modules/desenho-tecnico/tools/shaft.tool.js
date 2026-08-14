import { BaseTool } from './base.tool.js';
import { ShaftEntity } from '../entities/shaft.entity.js';

const DEFAULT_SEGMENTS = [
  { length: 40, diameter: 25 },
  { length: 60, diameter: 40 },
  { length: 40, diameter: 25 },
];

export class ShaftTool extends BaseTool {
  constructor(ctx) {
    super(ctx);
    this.name = 'shaft';
    this.origin = null;
    this.orientation = 'horizontal';
    this.segments = [];
    this.modal = null;
    this.form = null;
    this.isBound = false;
  }

  activate() {
    this.origin = null;
    this.segments = [];
    this.clearPreview();
    this.openModal();
  }

  deactivate() {
    this.hideModal();
    this.clearPreview();
  }

  openModal() {
    this.modal = document.getElementById('cadShaftModal');
    this.form = document.getElementById('cadShaftForm');
    if (!this.modal || !this.form) {
      this.ctx.statusMessage = 'Formulário do eixo indisponível.';
      return;
    }
    this.bindModal();
    if (!this.form.querySelector('[data-shaft-segment-row]')) this.renderRows(DEFAULT_SEGMENTS);
    const error = this.modal.querySelector('[data-shaft-error]');
    if (error) error.textContent = '';
    this.modal.hidden = false;
    this.ctx.prompt.set({ message: 'Configure os trechos, comprimentos e diâmetros do eixo.' });
  }

  bindModal() {
    if (this.isBound) return;
    this.isBound = true;
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        this.orientation = this.form.elements.orientation.value === 'vertical' ? 'vertical' : 'horizontal';
        this.segments = this.readRows();
        if (!this.segments.length) throw new Error('Adicione pelo menos um trecho.');
        this.hideModal();
        const total = this.segments.reduce((sum, item) => sum + item.length, 0);
        this.ctx.prompt.set({ message: 'Eixo configurado: clique no ponto inicial para posicionar.' });
        this.ctx.statusMessage = `Eixo com ${this.segments.length} trechos • comprimento ${total.toFixed(2)} mm`;
        this.ctx.render();
      } catch (error) {
        const message = this.modal.querySelector('[data-shaft-error]');
        if (message) message.textContent = error.message;
      }
    });
    this.modal.querySelector('[data-shaft-add]')?.addEventListener('click', () => {
      const rows = this.safeReadRows();
      rows.push({ length: 40, diameter: rows.at(-1)?.diameter || 25 });
      this.renderRows(rows);
    });
    this.modal.querySelector('[data-shaft-rows]')?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-shaft-remove]');
      if (!remove) return;
      const rows = this.safeReadRows();
      rows.splice(Number(remove.dataset.shaftRemove), 1);
      this.renderRows(rows.length ? rows : [{ length: 40, diameter: 25 }]);
    });
    this.modal.querySelectorAll('[data-shaft-close]').forEach((button) => button.addEventListener('click', () => {
      this.cancel();
      this.ctx.toolManager.set('select');
      this.ctx.render();
    }));
  }

  safeReadRows() {
    try { return this.readRows(false); } catch { return DEFAULT_SEGMENTS.map((item) => ({ ...item })); }
  }

  readRows(validate = true) {
    return [...this.form.querySelectorAll('[data-shaft-segment-row]')].map((row, index) => {
      const length = Number(row.querySelector('[name="segmentLength"]')?.value);
      const diameter = Number(row.querySelector('[name="segmentDiameter"]')?.value);
      if (validate && (!Number.isFinite(length) || length <= 0 || !Number.isFinite(diameter) || diameter <= 0)) {
        throw new Error(`Revise comprimento e diâmetro do trecho ${index + 1}.`);
      }
      return {
        length: Number.isFinite(length) && length > 0 ? length : 40,
        diameter: Number.isFinite(diameter) && diameter > 0 ? diameter : 25,
      };
    });
  }

  renderRows(rows) {
    const container = this.form.querySelector('[data-shaft-rows]');
    if (!container) return;
    container.innerHTML = rows.map((segment, index) => `
      <tr data-shaft-segment-row>
        <td><span class="cad-segment-index">${index + 1}</span></td>
        <td><input class="cad-input" name="segmentLength" type="number" min="0.001" step="0.001" value="${segment.length}"></td>
        <td><input class="cad-input" name="segmentDiameter" type="number" min="0.001" step="0.001" value="${segment.diameter}"></td>
        <td><button class="cad-icon-btn danger" data-shaft-remove="${index}" type="button" aria-label="Remover trecho ${index + 1}">×</button></td>
      </tr>`).join('');
  }

  hideModal() {
    if (this.modal) this.modal.hidden = true;
  }

  onMouseMove(evt) {
    if (!this.segments.length) return;
    const origin = this.ctx.getPoint(evt.world);
    this.setPreview([{ type: 'shaft', geometry: { origin, orientation: this.orientation, segments: this.segments } }]);
  }

  onMouseDown(evt) {
    if (!this.segments.length) return;
    this.origin = this.ctx.getPoint(evt.world);
    this.ctx.addEntity(new ShaftEntity({
      geometry: {
        origin: { ...this.origin },
        orientation: this.orientation,
        segments: this.segments.map((segment) => ({ ...segment })),
      },
      metadata: { layer: 'eixos', componentType: 'shaft', groupId: crypto.randomUUID() },
    }));
    this.ctx.statusMessage = 'Eixo paramétrico criado com medidas exatas.';
    this.origin = null;
    this.segments = [];
    this.clearPreview();
    this.ctx.toolManager.set('select');
    this.ctx.render();
  }

  cancel() {
    this.origin = null;
    this.segments = [];
    this.hideModal();
    this.clearPreview();
  }
}
