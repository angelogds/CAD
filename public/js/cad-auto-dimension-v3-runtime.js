function setCadStatus(message, state = 'ok') {
  const status = document.getElementById('mlightCadStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function markDirty() {
  const saveState = document.getElementById('mlightSaveState');
  if (!saveState) return;
  saveState.textContent = 'Alterações não salvas';
  saveState.dataset.state = 'saving';
}

function installFabButton(id, label, title, onClick) {
  if (document.getElementById(id)) return;
  const bar = document.querySelector('.cad-mlight-fabbar');
  if (!bar) return;
  const button = document.createElement('button');
  button.id = id;
  button.className = 'cad-mlight-action';
  button.type = 'button';
  button.title = title;
  button.innerHTML = label;
  button.addEventListener('click', onClick);
  bar.appendChild(button);
}

async function activateAutoDimensionV3() {
  if (!window.CAD_MLIGHT_READY || !window.CAD_MLIGHT_FABRICATION) return false;
  if (window.CAD_MLIGHT_AUTO_DIM_V3) return true;

  try {
    const module = await import('/vendor/mlightcad/mlightcad-auto-dimension-v3.js');
    const tools = module.createMlightAutoDimensionV3Tools({
      onStatus: (message) => setCadStatus(message, 'ok')
    });
    const fabrication = window.CAD_MLIGHT_FABRICATION;
    if (typeof fabrication.autoDimensionAll === 'function' && !fabrication.autoDimensionAllLegacy) {
      fabrication.autoDimensionAllLegacy = fabrication.autoDimensionAll.bind(fabrication);
    }
    fabrication.autoDimensionAll = tools.autoDimensionAll;
    fabrication.ensureTechnicalLayers = tools.ensureTechnicalLayers;
    fabrication.clearAutoDimensions = tools.clearAutoDimensions;
    window.CAD_MLIGHT_AUTO_DIM_V3 = tools;

    const autoButton = document.getElementById('mlightAutoDimBtn');
    if (autoButton) {
      const span = autoButton.querySelector('span');
      if (span) span.textContent = 'AUTO COTAR V3';
      autoButton.title = 'Gerar cotas de fabricação com organização automática, reconhecimento de eixo escalonado e PCD';
    }

    installFabButton(
      'mlightTechnicalLayersBtn',
      '▦ <span>Layers técnicos</span>',
      'Criar os layers FAB_* padronizados sem alterar a geometria existente',
      () => {
        try {
          const result = tools.ensureTechnicalLayers();
          if (result?.count > 0) markDirty();
        } catch (error) {
          console.error('[CAD][AUTO-DIM-V3] layers', error);
          setCadStatus(`Falha ao preparar layers técnicos: ${error.message || error}`, 'error');
        }
      }
    );

    installFabButton(
      'mlightClearAutoDimsBtn',
      '⌫ <span>Limpar cotas</span>',
      'Remover somente cotas geradas automaticamente, preservando cotas manuais',
      () => {
        try {
          const result = tools.clearAutoDimensions();
          if (result?.count > 0) markDirty();
        } catch (error) {
          console.error('[CAD][AUTO-DIM-V3] clear', error);
          setCadStatus(`Falha ao limpar cotas automáticas: ${error.message || error}`, 'error');
        }
      }
    );

    document.documentElement.dataset.cadAutoDim = 'v3';
    setCadStatus('AUTO COTAR V3 ativo • layers FAB_* • eixo escalonado • PCD', 'ok');
    return true;
  } catch (error) {
    console.error('[CAD][AUTO-DIM-V3] Falha ao ativar', error);
    document.documentElement.dataset.cadAutoDim = 'v2-fallback';
    setCadStatus(`AUTO COTAR V3 indisponível; V2 mantido. ${error.message || error}`, 'error');
    return false;
  }
}

window.addEventListener('cad:mlight-ready', () => {
  void activateAutoDimensionV3();
}, { once: true });

if (window.CAD_MLIGHT_READY) void activateAutoDimensionV3();
