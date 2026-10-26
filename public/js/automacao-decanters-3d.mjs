import { mountIndustrialViewer } from './automacao-industrial-viewer.mjs';
import { createIndustrialScene } from './automacao-decanters-scene.mjs';

mountIndustrialViewer({ hostId: 'dec-three-host', schemeId: 'dec-scheme-host', statusId: 'dec-view-message',
  loadingId: 'dec-3d-loading', prefix: 'decanters', dashboardName: 'AutomacaoDecantersDashboard',
  createModel: createIndustrialScene, target: [-0.4,1.5,-1.5], viewWidth: 29, viewHeight: 17 });
