import { mountIndustrialViewer } from './automacao-industrial-viewer.mjs';
import { createPrensasScene } from './automacao-prensas-scene.mjs';

mountIndustrialViewer({
  hostId: 'pr-three-host', schemeId: 'pr-scheme-host', statusId: 'pr-view-message',
  loadingId: 'pr-3d-loading', prefix: 'prensas',
  dashboardName: 'AutomacaoPrensasDashboard',
  createModel: createPrensasScene,
  fitPosition: [19,16,23], target: [0,3,0], viewWidth: 29, viewHeight: 16
});
