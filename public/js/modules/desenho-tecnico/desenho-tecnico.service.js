import { DesenhoTecnicoController } from './desenho-tecnico.controller.js';

export function bootstrapDesenhoTecnico() {
  const svg = document.getElementById('cadCanvas');
  if (!svg) return null;
  const initial = window.CAD_INITIAL?.data || { objects: [] };
  return new DesenhoTecnicoController(svg, initial);
}
