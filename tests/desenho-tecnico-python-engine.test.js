'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('integração CAD Python mantém serviço opcional e isolado', () => {
  const service = read('modules/desenho-tecnico/cad-python.service.js');
  assert.match(service, /CAD_PYTHON_URL/);
  assert.match(service, /CAD_PYTHON_TOKEN/);
  assert.match(service, /AbortController/);
  assert.match(service, /CAD Python Engine não configurado/);
});

test('rotas do desenho técnico expõem análise e DXF sem alterar permissões base', () => {
  const routes = read('modules/desenho-tecnico/desenho-tecnico.routes.js');
  assert.match(routes, /\/cad\/:id\/python\/status/);
  assert.match(routes, /\/cad\/:id\/analisar/);
  assert.match(routes, /\/cad\/:id\/dxf/);
  assert.match(routes, /\/cad\/:id\/dxf\/importar/);
  assert.match(routes, /requireRole\(MANAGE_ACCESS\)/);
});

test('editor oferece análise técnica, exportação e importação DXF', () => {
  const ui = read('public/js/cad-python-integration.js');
  const entry = read('public/js/cad-engine-v2.js');
  assert.match(ui, /Análise técnica do desenho/);
  assert.match(ui, /Importar DXF/);
  assert.match(ui, /estimated_mass_kg/);
  assert.match(entry, /import '\.\/cad-python-integration\.js'/);
});

test('workflow inclui suíte Python independente', () => {
  const workflow = read('.github/workflows/node-tests.yml');
  assert.match(workflow, /CAD Python Engine - regressão/);
  assert.match(workflow, /actions\/setup-python@v6/);
  assert.match(workflow, /python -m unittest discover/);
});
