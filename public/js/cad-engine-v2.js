/*
 * Editor CAD 2D estável — Campo do Gado V2
 *
 * Ponto único de bootstrap do editor.
 * O script é carregado no final da página, portanto o DOM do CAD já existe.
 * Não dependemos de DOMContentLoaded: imports assíncronos podem concluir
 * depois desse evento e deixar a interface visível, porém sem eventos.
 */

import { startCadEditor } from './cad-legacy-engine.js?v=20261006-trim-v5';

function setBootStatus(message, isError = false) {
  const status = document.getElementById('cadStatusMessage');
  if (status) status.textContent = message;
  document.documentElement.dataset.cadEngine = isError ? 'stable-2d-error' : 'stable-2d';
}

try {
  const cad = startCadEditor();
  if (!cad || !window.CAD_APP) throw new Error('Controlador CAD não foi criado');
  if (!cad.isUiBound) throw new Error('Eventos da interface CAD não foram registrados');

  document.documentElement.dataset.cadInteractive = 'true';
  setBootStatus('Editor CAD 2D pronto • mm • salvamento automático ativo');
  console.info('[CAD] Bootstrap concluído: interface e canvas interativos.');
} catch (error) {
  console.error('[CAD][STABLE-2D] Falha ao iniciar editor:', error);
  document.documentElement.dataset.cadInteractive = 'false';
  setBootStatus(`Falha ao iniciar editor: ${error?.message || error}`, true);

  const workspace = document.getElementById('cadWorkspace');
  if (workspace && !document.getElementById('cadStableBootError')) {
    const box = document.createElement('div');
    box.id = 'cadStableBootError';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:560px;padding:20px;border:1px solid #7f1d1d;border-radius:10px;background:#1f1518;color:#f8fafc;z-index:40;box-shadow:0 18px 48px rgba(0,0,0,.35)';
    box.innerHTML = '<strong style="display:block;margin-bottom:8px">Falha ao iniciar o editor 2D</strong><span style="display:block;color:#cbd5e1;margin-bottom:14px">O erro foi registrado no console. Recarregue a página para tentar novamente.</span><button type="button" id="cadStableRetry" style="padding:8px 12px;border:0;border-radius:6px;background:#15803d;color:#fff;font-weight:700;cursor:pointer">Tentar novamente</button>';
    workspace.appendChild(box);
    document.getElementById('cadStableRetry')?.addEventListener('click', () => window.location.reload());
  }
}
