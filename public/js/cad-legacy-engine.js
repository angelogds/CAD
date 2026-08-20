import './cad-python-integration.js';
import { bootstrapDesenhoTecnico } from './modules/desenho-tecnico/desenho-tecnico.service.js';
import { RotateTool } from './modules/desenho-tecnico/tools/rotate.tool.js';
import { FilletTool } from './modules/desenho-tecnico/tools/fillet.tool.js';
import { ChamferTool } from './modules/desenho-tecnico/tools/chamfer.tool.js';

function installLegacyAdvancedTools(cad) {
  if (!cad?.toolManager || !cad?.ctx) return;
  cad.toolManager.register(new RotateTool(cad.ctx));
  cad.toolManager.register(new FilletTool(cad.ctx));
  cad.toolManager.register(new ChamferTool(cad.ctx));

  const priorAction = cad.executeAction.bind(cad);
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
    return priorAction(action, source);
  };

  const aliases = {
    ro: 'tool-rotate', rotate: 'tool-rotate', rotacionar: 'tool-rotate',
    fi: 'tool-fillet', fillet: 'tool-fillet',
    cha: 'tool-chamfer', chamfer: 'tool-chamfer', chanfro: 'tool-chamfer',
    all: 'select-all', clearsel: 'clear-selection'
  };
  const priorCommand = cad.executeCommand.bind(cad);
  cad.executeCommand = (raw) => {
    const command = String(raw || '').trim().toLowerCase();
    const action = aliases[command];
    if (!action) return priorCommand(raw);
    const tool = action.startsWith('tool-') ? action.slice(5) : '';
    cad.executeAction(action, tool ? { dataset: { tool } } : null);
    return true;
  };
}

window.addEventListener('DOMContentLoaded', () => {
  const cad = bootstrapDesenhoTecnico();
  if (!cad) {
    const status = document.getElementById('cadStatusMessage');
    if (status) status.textContent = 'Falha ao inicializar editor técnico anterior.';
    return;
  }
  installLegacyAdvancedTools(cad);
  cad.render?.();
});
