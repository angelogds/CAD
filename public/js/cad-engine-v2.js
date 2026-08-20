import { bootstrapDesenhoTecnico } from './modules/desenho-tecnico/desenho-tecnico.service.js';
import { RotateTool } from './modules/desenho-tecnico/tools/rotate.tool.js';
import { FilletTool } from './modules/desenho-tecnico/tools/fillet.tool.js';
import { ChamferTool } from './modules/desenho-tecnico/tools/chamfer.tool.js';

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

function createSideToolButton({ action, tool, icon, label, title }) {
  const button = document.createElement('button');
  button.className = 'cad-tool-btn';
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.tool = tool;
  button.dataset.tooltip = title || label;
  button.title = title || label;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<span class="cad-tool-icon" aria-hidden="true">${icon}</span><span>${label}</span>`;
  return button;
}

function installAdvancedTools(cad) {
  if (!cad?.toolManager || !cad?.ctx) return;

  cad.toolManager.register(new RotateTool(cad.ctx));
  cad.toolManager.register(new FilletTool(cad.ctx));
  cad.toolManager.register(new ChamferTool(cad.ctx));

  const labels = {
    rotate: 'Rotacionar',
    fillet: 'Arredondar / Fillet',
    chamfer: 'Chanfro / Chamfer',
  };
  const originalGetToolLabel = cad.getToolLabel.bind(cad);
  cad.getToolLabel = (name) => labels[name] || originalGetToolLabel(name);

  const originalExecuteAction = cad.executeAction.bind(cad);
  cad.executeAction = (action, source) => {
    if (action === 'select-all') {
      const ids = cad.state.entities.filter((entity) => {
        const layer = cad.state.layers[entity.metadata?.layer || cad.state.activeLayer] || {};
        return entity.visible !== false && layer.visible !== false;
      }).map((entity) => entity.id);
      cad.selection.set(ids);
      cad.state.statusMessage = `Selecionados ${ids.length} objeto(s) visíveis.`;
      cad.render();
      return;
    }
    if (action === 'clear-selection') {
      cad.selection.clear();
      cad.state.statusMessage = 'Seleção limpa.';
      cad.render();
      return;
    }
    return originalExecuteAction(action, source);
  };

  const advancedAliases = {
    ro: 'tool-rotate',
    rotate: 'tool-rotate',
    rotacionar: 'tool-rotate',
    girar: 'tool-rotate',
    fi: 'tool-fillet',
    fillet: 'tool-fillet',
    arredondar: 'tool-fillet',
    arredondamento: 'tool-fillet',
    ch: 'tool-chamfer',
    cha: 'tool-chamfer',
    chamfer: 'tool-chamfer',
    chanfro: 'tool-chamfer',
    all: 'select-all',
    selecionartudo: 'select-all',
    clearsel: 'clear-selection',
    limparsel: 'clear-selection',
  };
  const originalExecuteCommand = cad.executeCommand.bind(cad);
  cad.executeCommand = (rawCommand) => {
    const command = String(rawCommand || '').trim().toLowerCase();
    const action = advancedAliases[command];
    if (!action) return originalExecuteCommand(rawCommand);
    cad.lastCommand = command;
    if (cad.commandHistory[cad.commandHistory.length - 1] !== command) cad.commandHistory.push(command);
    cad.commandHistoryIndex = cad.commandHistory.length;
    const tool = action.startsWith('tool-') ? action.slice(5) : '';
    cad.executeAction(action, tool ? { dataset: { tool } } : null);
    return true;
  };
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

  if (modifyGroup) {
    const deleteButton = modifyGroup.querySelector('[data-action="delete-selection"]');
    const advancedModify = [
      { action: 'tool-mirror', tool: 'mirror', icon: '⇆', label: 'Espelhar', title: 'Espelhar seleção (MI)' },
      { action: 'tool-rotate', tool: 'rotate', icon: '↻', label: 'Rotacionar', title: 'Rotacionar seleção (RO)' },
      { action: 'tool-fillet', tool: 'fillet', icon: '⌒', label: 'Fillet', title: 'Arredondar canto entre linhas (FI)' },
      { action: 'tool-chamfer', tool: 'chamfer', icon: '⌞', label: 'Chanfro', title: 'Criar chanfro entre linhas (CHA)' },
    ];
    advancedModify.forEach((config) => {
      if (modifyGroup.querySelector(`[data-action="${config.action}"]`)) return;
      modifyGroup.insertBefore(createRibbonButton(config), deleteButton || null);
    });
  }

  if (!ribbon.querySelector('.cad-ribbon-selection')) {
    const group = document.createElement('div');
    group.className = 'cad-ribbon-group cad-ribbon-selection';
    group.innerHTML = '<span class="cad-ribbon-label">Seleção</span>';
    group.appendChild(createRibbonButton({ action: 'select-all', icon: '▣', label: 'Tudo', title: 'Selecionar todos os objetos visíveis (Ctrl+A)' }));
    group.appendChild(createRibbonButton({ action: 'clear-selection', icon: '□', label: 'Limpar', title: 'Limpar seleção' }));
    if (precisionGroup) ribbon.insertBefore(group, precisionGroup);
    else ribbon.appendChild(group);
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

  const leftPanel = document.querySelector('.cad-panel-left');
  if (leftPanel && !leftPanel.querySelector('.cad-tool-group-modify')) {
    const group = document.createElement('div');
    group.className = 'cad-tool-group cad-tool-group-modify';
    group.innerHTML = '<span class="cad-tool-group-label">Modificar</span>';
    [
      { action: 'tool-rotate', tool: 'rotate', icon: '↻', label: 'Rotacionar', title: 'Rotacionar (RO)' },
      { action: 'tool-fillet', tool: 'fillet', icon: '⌒', label: 'Fillet', title: 'Arredondar canto (FI)' },
      { action: 'tool-chamfer', tool: 'chamfer', icon: '⌞', label: 'Chanfro', title: 'Chanfro (CHA)' },
      { action: 'tool-mirror', tool: 'mirror', icon: '⇆', label: 'Espelhar', title: 'Espelhar (MI)' },
    ].forEach((config) => group.appendChild(createSideToolButton(config)));
    const viewGroup = Array.from(leftPanel.querySelectorAll(':scope > .cad-tool-group')).find((item) => item.textContent.includes('Vista'));
    leftPanel.insertBefore(group, viewGroup || null);
  }

  document.querySelectorAll('.cad-tool-btn').forEach((button) => {
    const label = button.querySelector('span:last-child')?.textContent?.trim();
    if (!label) return;
    if (!button.dataset.tooltip) button.dataset.tooltip = label;
    if (!button.title) button.title = label;
    if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', label);
  });

  const commandInput = document.getElementById('cadCommandInput');
  if (commandInput) commandInput.placeholder = 'Comandos: L, C, M, RO, FI, CHA, MI, D, F, X...';

  cad?.render?.();
}

window.addEventListener('DOMContentLoaded', () => {
  const cad = bootstrapDesenhoTecnico();
  if (!cad) {
    const s = document.getElementById('cadStatusMessage');
    if (s) s.textContent = 'Falha ao inicializar editor técnico.';
    return;
  }

  installAdvancedTools(cad);
  enhanceCadWorkspace(cad);
});
