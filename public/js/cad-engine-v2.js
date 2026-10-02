/*
 * Editor CAD 2D estável — Campo do Gado V2
 *
 * Este arquivo é o único entrypoint carregado pela tela do editor.
 * O motor principal é o editor 2D modular do próprio sistema.
 * Extensões MLightCAD ficam fora do caminho crítico até serem revalidadas
 * isoladamente. Nenhuma extensão opcional pode derrubar o editor inteiro.
 */

function setBootStatus(message, isError = false) {
  const status = document.getElementById('cadStatusMessage');
  if (status) status.textContent = message;
  document.documentElement.dataset.cadEngine = isError ? 'stable-2d-error' : 'stable-2d';
}

try {
  await import('./cad-legacy-engine.js');
  setBootStatus('Editor CAD 2D pronto');
} catch (error) {
  console.error('[CAD][STABLE-2D] Falha ao iniciar editor:', error);
  setBootStatus(`Falha ao iniciar editor: ${error?.message || error}`, true);

  const workspace = document.getElementById('cadWorkspace');
  if (workspace && !document.getElementById('cadStableBootError')) {
    const box = document.createElement('div');
    box.id = 'cadStableBootError';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:560px;padding:20px;border:1px solid #7f1d1d;border-radius:10px;background:#1f1518;color:#f8fafc;z-index:40;box-shadow:0 18px 48px rgba(0,0,0,.35)';
    box.innerHTML = '<strong style="display:block;margin-bottom:8px">Falha ao iniciar o editor 2D</strong><span style="display:block;color:#cbd5e1;margin-bottom:14px">O erro foi registrado no console. A tela não será substituída por uma página vazia.</span><button type="button" id="cadStableRetry" style="padding:8px 12px;border:0;border-radius:6px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">Tentar novamente</button>';
    workspace.appendChild(box);
    document.getElementById('cadStableRetry')?.addEventListener('click', () => window.location.reload());
  }
}
