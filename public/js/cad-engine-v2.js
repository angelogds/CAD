import { bootstrapDesenhoTecnico } from './modules/desenho-tecnico/desenho-tecnico.service.js';

function setRibbonLabel(group, text) {
  const label = group?.querySelector('.cad-ribbon-label');
  if (label) label.textContent = text;
}

function createRibbonButton({ action, tool, icon, label, title, danger = false }) {
  const button = document.createElement('button');
  button.className = `cad-ribbon-btn${danger ? ' danger' : ''}`;
  button.type = 'button';
  button.dataset.action = action;
  if (tool) button.dataset.tool = tool;
  button.title = title || label;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<span class="cad-ribbon-icon" aria-hidden="true">${icon}</span><span>${label}</span>`;
  return button;
}

function enhanceCadWorkspace(cad) {
  const ribbon = document.querySelector('.cad-ribbon');
  if (!ribbon) return;

  const groups = Array.from(ribbon.querySelectorAll(':scope > .cad-ribbon-group'));
  const mechanicalGroup = groups.find((group) => group.classList.contains('cad-ribbon-featured')) || groups[0];
  const drawGroup = groups.find((group) => group.querySelector('[data-action="tool-line"]'));
  const modifyGroup = groups.find((group) => group.querySelector('[data-action="tool-move"]'));
  const precisionGroup = groups.find((group) => group.classList.contains('cad-ribbon-precision'));

  setRibbonLabel(mechanicalGroup, 'Mecânica');
  setRibbonLabel(drawGroup, 'Desenhar');
  setRibbonLabel(modifyGroup, 'Modificar');
  setRibbonLabel(precisionGroup, 'Precisão');

  if (modifyGroup && !modifyGroup.querySelector('[data-action="tool-mirror"]')) {
    const deleteButton = modifyGroup.querySelector('[data-action="delete-selection"]');
    const mirror = createRibbonButton({
      action: 'tool-mirror',
      tool: 'mirror',
      icon: '⇆',
      label: 'Espelhar',
      title: 'Espelhar seleção (MI)',
    });
    modifyGroup.insertBefore(mirror, deleteButton || null);
  }

  if (!ribbon.querySelector('.cad-ribbon-annotation')) {
    const group = document.createElement('div');
    group.className = 'cad-ribbon-group cad-ribbon-annotation';
    group.innerHTML = '<span class="cad-ribbon-label">Cotas e anotação</span>';

    [
      { action: 'tool-dim-linear', tool: 'dim_linear', icon: '↔', label: 'Linear', title: 'Cota linear (D)' },
      { action: 'tool-dim-diameter', tool: 'dim_diameter', icon: '⌀', label: 'Diâmetro', title: 'Cota de diâmetro (DD)' },
      { action: 'tool-dim-angular', tool: 'dim_angular', icon: '∠', label: 'Angular', title: 'Cota angular (DA)' },
      { action: 'tool-centerline', tool: 'centerline', icon: '╍', label: 'Centro', title: 'Linha de centro (CL)' },
      { action: 'tool-measure', tool: 'measure', icon: '⌖', label: 'Medir', title: 'Medir distância (DI)' },
    ].forEach((config) => group.appendChild(createRibbonButton(config)));

    if (precisionGroup) ribbon.insertBefore(group, precisionGroup);
    else ribbon.appendChild(group);
  }

  document.querySelectorAll('.cad-tool-btn').forEach((button) => {
    const label = button.querySelector('span:last-child')?.textContent?.trim();
    if (!label) return;
    if (!button.dataset.tooltip) button.dataset.tooltip = label;
    if (!button.title) button.title = label;
    if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', label);
  });

  cad?.render?.();
}

window.addEventListener('DOMContentLoaded', () => {
  const cad = bootstrapDesenhoTecnico();
  if (!cad) {
    const s = document.getElementById('cadStatusMessage');
    if (s) s.textContent = 'Falha ao inicializar editor técnico.';
    return;
  }

  enhanceCadWorkspace(cad);
});
