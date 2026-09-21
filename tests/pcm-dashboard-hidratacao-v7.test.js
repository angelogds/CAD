const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('dashboard busca dados reais automaticamente ao abrir', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /async function init\(\)/);
  assert.match(js, /renderAll\(\);/);
  assert.match(js, /await load\(params,\{silent:true,replaceHistory:false\}\)/);
  assert.match(js, /document\.addEventListener\('DOMContentLoaded',init\)/);
});

test('carregamento inicial usa endpoint JSON sem cache e preserva fallback renderizado', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /cache:'no-store'/);
  assert.match(js, /if\(!res\.ok\|\|!json\.ok\|\|!json\.dashboard\)/);
  assert.match(js, /pcmDataRuntimeAlert/);
  assert.match(js, /Exibindo a última informação disponível/);
});

test('cache do dashboard foi atualizado após correção de hidratação', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(view, /pcm-dashboard\.js\?v=20260920-v10/);
});

test('javascript permanece sintaticamente válido', () => {
  assert.doesNotThrow(() => new Function(read('public/js/pcm-dashboard.js')));
});
