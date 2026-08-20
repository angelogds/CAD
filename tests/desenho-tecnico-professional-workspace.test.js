'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('viewport salvo só é mantido quando a geometria continua visível', async () => {
  const logic = await import(`${pathToFileURL(path.join(root, 'public/js/modules/desenho-tecnico/professional-workspace.logic.mjs')).href}?t=${Date.now()}`);
  const bounds = { minX: -100, minY: -50, maxX: 100, maxY: 50 };
  assert.equal(logic.isUsefulViewport({ width: 1000, height: 800, zoom: 1, offsetX: 500, offsetY: 400 }, bounds), true);
  assert.equal(logic.isUsefulViewport({ width: 1000, height: 800, zoom: 1, offsetX: -10000, offsetY: -10000 }, bounds), false);
  assert.equal(logic.isUsefulViewport({ width: 1000, height: 800, zoom: 0.01, offsetX: 500, offsetY: 400 }, bounds), false);
});

test('FeatureManager agrupa entidades por layer e reconhece primitivas técnicas', async () => {
  const logic = await import(`${pathToFileURL(path.join(root, 'public/js/modules/desenho-tecnico/professional-workspace.logic.mjs')).href}?tree=${Date.now()}`);
  const groups = logic.buildFeatureTreeModel([
    { id: 1, type: 'circle', metadata: { layer: 'furos' } },
    { id: 2, type: 'line', metadata: { layer: 'contorno', primitive: 'hatch' } },
    { id: 3, type: 'shaft', metadata: { layer: 'eixos' } },
  ], { furos: {}, contorno: {}, eixos: {} }, 'contorno');
  assert.equal(groups[0].name, 'contorno');
  assert.equal(groups.flatMap((g) => g.entities).some((item) => item.label === 'Hachura 1'), true);
  assert.equal(groups.flatMap((g) => g.entities).some((item) => item.label === 'Círculo 1'), true);
  assert.equal(groups.flatMap((g) => g.entities).some((item) => item.label === 'Eixo 1'), true);
});

test('workspace profissional corrige enquadramento e organiza árvore, grid e layouts', () => {
  const workspace = read('public/js/modules/desenho-tecnico/cad-professional-workspace.js');
  const service = read('public/js/modules/desenho-tecnico/desenho-tecnico.service.js');
  assert.match(service, /installCadProfessionalWorkspace/);
  assert.match(workspace, /zoomExtents\(bounds\)/);
  assert.match(workspace, /viewport salvo estava fora da geometria/);
  assert.match(workspace, /cad-feature-tree/);
  assert.match(workspace, /cad-ucs-widget/);
  assert.match(workspace, /LAYOUT A4/);
  assert.match(workspace, /display-hatch/);
  assert.match(workspace, /MutationObserver/);
  assert.match(workspace, /recurso auxiliar com erro/);
});

test('modo arame oculta somente hachuras durante a renderização sem alterar persistência', () => {
  const workspace = read('public/js/modules/desenho-tecnico/cad-professional-workspace.js');
  assert.match(workspace, /mode === 'wireframe'/);
  assert.match(workspace, /metadata\?\.primitive/);
  assert.match(workspace, /temporarilyHidden/);
  assert.match(workspace, /entity\.visible = true/);
  assert.doesNotMatch(workspace, /saveCad\(/);
});

test('motor Python aparece como básico quando offline e avançado quando online', () => {
  const pythonUi = read('public/js/cad-python-integration.js');
  assert.match(pythonUi, /MOTOR TÉCNICO • AVANÇADO/);
  assert.match(pythonUi, /MOTOR TÉCNICO • BÁSICO/);
  assert.match(pythonUi, /cad-python-tools-menu/);
  assert.doesNotMatch(pythonUi, /PYTHON OFFLINE/);
});
