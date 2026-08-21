try {
  await import('./cad-mlight-runtime.js');
  await import('./cad-round3-runtime.js');
} catch (error) {
  console.error('[CAD] Falha ao iniciar o MLightCAD:', error);
  document.documentElement.dataset.cadEngine = 'mlightcad-error';
  const message = document.createElement('div');
  message.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#151b20;color:#f4f7f9;font-family:system-ui,sans-serif;z-index:99999;padding:24px';
  message.innerHTML = '<div style="max-width:620px;text-align:center"><h2>Não foi possível iniciar o editor CAD</h2><p>Recarregue a página. Se o problema continuar, registre a mensagem do console para diagnóstico.</p><button type="button" onclick="location.reload()" style="padding:10px 16px;border-radius:6px;border:1px solid #4d5963;background:#2387bd;color:#fff;font-weight:700;cursor:pointer">Recarregar</button></div>';
  document.body.appendChild(message);
}
