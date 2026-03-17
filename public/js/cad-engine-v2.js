import { bootstrapDesenhoTecnico } from './modules/desenho-tecnico/desenho-tecnico.service.js';
window.addEventListener('DOMContentLoaded', () => {
  const cad = bootstrapDesenhoTecnico();
  if (!cad) {
    const s = document.getElementById('cadStatusMessage');
    if (s) s.textContent = 'Falha ao inicializar editor técnico.';
  }
});
