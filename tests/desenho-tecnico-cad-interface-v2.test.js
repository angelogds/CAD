'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Interface CAD V2 é carregada depois da precisão sem substituir o MLightCAD', () => {
  const engine = read('public/js/cad-engine-v2.js');
  const precisionIndex = engine.indexOf("cad-precision-assist-runtime.js");
  const interfaceIndex = engine.indexOf("cad-interface-v2.js");
  assert.ok(precisionIndex >= 0, 'runtime de precisão deve continuar carregado');
  assert.ok(interfaceIndex > precisionIndex, 'Interface V2 deve carregar depois da precisão');
  assert.doesNotMatch(engine, /legacy-engine|engine=legacy/i);
});

test('topo agrupa ações de arquivo sem recriar listeners das ferramentas', () => {
  const source = read('public/js/cad-interface-v2.js');
  assert.match(source, /cad-interface-file-menu/);
  assert.match(source, /mlightDxfImportBtn/);
  assert.match(source, /mlightDxfExportBtn/);
  assert.match(source, /cad-interface-file-action/);
  assert.match(source, /appendChild\(node\)/, 'botões existentes devem ser movidos, não recriados');
});

test('menu lateral possui busca, grupos recolhíveis e memória de estado', () => {
  const source = read('public/js/cad-interface-v2.js');
  assert.match(source, /cadToolSearchInput/);
  assert.match(source, /cad-tool-group-toggle/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /CAD_INTERFACE_V2_STATE_PREFIX/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /normalize\('NFD'\)/);
});

test('statusbar mantém precisão mas move ações secundárias para o painel', () => {
  const source = read('public/js/cad-interface-v2.js');
  assert.match(source, /cadPrecisionMeasure/);
  assert.match(source, /cadPrecisionPolarLine/);
  assert.match(source, /cad-interface-precision-actions/);
  assert.match(source, /cad-interface-command-label/);
  assert.match(source, /data-cad-command/);
});

test('CSS da Interface V2 cobre desktop tablet e celular', () => {
  const css = read('public/css/cad-interface-v2.css');
  assert.match(css, /cad-interface-file-popover/);
  assert.match(css, /cad-tool-search/);
  assert.match(css, /cad-tool-group-toggle/);
  assert.match(css, /cad-mlight-statusbar/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
});
