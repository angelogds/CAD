export function renderProperties(entity) {
  const panel = document.getElementById('cadProperties');
  if (!panel) return;
  panel.innerHTML = entity ? `<pre style='font-size:11px;white-space:pre-wrap'>${JSON.stringify(entity, null, 2)}</pre>` : '<p style="color:#94a3b8;font-size:12px;">Selecione um objeto para editar suas propriedades.</p>';
}
