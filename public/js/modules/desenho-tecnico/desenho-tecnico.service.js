import { DesenhoTecnicoController } from './desenho-tecnico.controller.js';
import { installCadFinal2D } from '../../cad-final-2d.js';
import { installCadProfessionalWorkspace } from './cad-professional-workspace.js';

export function bootstrapDesenhoTecnico() {
  const svg = document.getElementById('cadCanvas');
  if (!svg) return null;
  const initial = window.CAD_INITIAL?.data || { objects: [] };
  const cad = new DesenhoTecnicoController(svg, initial);
  window.CAD_APP = cad;
  installCadFinal2D(cad);
  installCadProfessionalWorkspace(cad);
  return cad;
}
