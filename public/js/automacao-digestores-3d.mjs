import { mountIndustrialViewer } from './automacao-industrial-viewer.mjs';
import { createDigestorScene } from './automacao-digestores-scene.mjs';

mountIndustrialViewer({
  hostId: 'digestores-circuito-3d',
  schemeId: 'digestores-circuito-scheme',
  statusId: 'digestores-circuito-3d-status',
  loadingId: 'digestores-circuito-3d-loading',
  prefix: 'digestores-circuito',
  dashboardName: 'AutomacaoDigestoresCircuito',
  createModel: createDigestorScene,
  fitPosition: [20, 16, 26],
  target: [-0.5, 3, 1.3],
  viewWidth: 30,
  viewHeight: 15
});
