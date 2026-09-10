const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('novos documentos do portal RH usam storage privado e downloads protegidos', () => {
  const routes = read('modules/colaboradores/colaboradores.routes.js');
  const documents = read('modules/rh/rh.documents.js');
  const controller = read('modules/rh/rh.controller.js');
  const portalRoutes = read('modules/meu-portal/meu-portal.routes.js');
  const portalController = read('modules/rh/rh.portal.controller.js');
  const view = read('views/rh/index.ejs');

  assert.match(documents, /path\.join\(storage\.DATA_DIR, 'rh', 'documentos'\)/);
  assert.match(documents, /PRIVATE_PREFIX = 'rh-private:\/\/'/);
  assert.match(routes, /router\.post\('\/:id\/rh-documentos', requireRole\(\['ADMIN', 'RH'\]\), uploadRhDocSeguro/);
  assert.match(routes, /router\.get\('\/:id\/rh-documentos\/:documentoId\/arquivo', requireRole\(\['ADMIN', 'RH'\]\)/);
  assert.match(controller, /rhDocuments\.privateMarker\(req\.file\.filename\)/);
  assert.match(view, /action="\/colaboradores\/<%= person\.id %>\/rh-documentos"/);
  assert.match(portalRoutes, /router\.get\('\/rh\/documentos\/:documentoId\/arquivo', rhPortalCtrl\.documentoArquivo\)/);
  assert.match(portalController, /getPrivateDocumentForDownload\(Number\(req\.params\.documentoId\), Number\(rh\.colaborador\.id\)\)/);
});

test('Diretoria recebe apenas indicadores e não recebe pendências nominais nem ficha sensível', () => {
  const controller = read('modules/rh/rh.controller.js');
  const view = read('views/rh/index.ejs');

  assert.match(controller, /if \(!dashboard\.canManage\) dashboard = \{ \.\.\.dashboard, pendencias: \[\] \}/);
  assert.match(controller, /requestedId && dashboard\.canManage/);
  assert.match(view, /Pendências nominais e dados pessoais permanecem restritos ao RH\/ADMIN/);
  assert.match(view, /if \(!d\.canManage\)/);
});
