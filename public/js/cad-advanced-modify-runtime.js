function setCadStatus(message, state = 'ok') {
  const status = document.getElementById('mlightCadStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function markDrawingDirty() {
  const saveState = document.getElementById('mlightSaveState');
  if (!saveState) return;
  saveState.textContent = 'Alterações não salvas';
  saveState.dataset.state = 'saving';
}

function injectAdvancedModifyUi() {
  const fabbar = document.querySelector('.cad-mlight-fabbar');
  if (!fabbar || document.getElementById('mlightMirrorGeometryBtn')) return;

  fabbar.insertAdjacentHTML('afterbegin', `
    <span class="cad-mlight-fabbar-title">MODIFICAR</span>
    <button id="mlightMirrorGeometryBtn" class="cad-mlight-action" type="button" title="Espelhar cópias dos objetos selecionados">⇄ <span>Espelhar</span></button>
    <button id="mlightFilletGeometryBtn" class="cad-mlight-action" type="button" title="Arredondar o encontro de duas linhas com raio definido">⌒ <span>Arredondar</span></button>
    <button id="mlightChamferGeometryBtn" class="cad-mlight-action" type="button" title="Criar chanfro geométrico entre duas linhas">◩ <span>Chanfro 2D</span></button>
    <span class="cad-round3-divider" aria-hidden="true"></span>
  `);

  const app = window.CAD_MLIGHT_APP;
  const run = (command, label) => {
    if (!app?.runCommand) {
      setCadStatus('O motor CAD ainda não está pronto para modificar a geometria.', 'error');
      return;
    }
    markDrawingDirty();
    setCadStatus(`${label}: siga as instruções na linha de comando.`, 'ok');
    app.runCommand(command);
  };

  document.getElementById('mlightMirrorGeometryBtn')?.addEventListener('click', () => run('mirror', 'Espelhar'));
  document.getElementById('mlightFilletGeometryBtn')?.addEventListener('click', () => run('fillet', 'Arredondar'));
  document.getElementById('mlightChamferGeometryBtn')?.addEventListener('click', () => run('chamfer', 'Chanfro 2D'));
}

async function initAdvancedModify() {
  if (window.CAD_MLIGHT_ADVANCED_MODIFY_READY || !window.CAD_MLIGHT_READY) return;
  try {
    const module = await import('/vendor/mlightcad/mlightcad-advanced-modify.js');
    module.registerMlightAdvancedModifyCommands();
    injectAdvancedModifyUi();
    window.CAD_MLIGHT_ADVANCED_MODIFY_READY = true;
  } catch (error) {
    console.error('[CAD][MLIGHTCAD][ADVANCED-MODIFY]', error);
    setCadStatus(`Ferramentas avançadas indisponíveis: ${error.message || error}`, 'error');
  }
}

if (window.CAD_MLIGHT_READY) {
  await initAdvancedModify();
} else {
  window.addEventListener('cad:mlight-ready', () => initAdvancedModify(), { once: true });
}
