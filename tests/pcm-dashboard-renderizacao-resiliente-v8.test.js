const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('inicialização busca dados antes de renderizar fallback', () => {
  const js = read('public/js/pcm-dashboard.js');
  const init = js.slice(js.indexOf('async function init()'));
  assert.match(init, /const loaded=await load\(params,\{silent:true,replaceHistory:false\}\)/);
  assert.match(init, /if\(!loaded\)renderAll\(\)/);
  assert.ok(init.indexOf('await load') < init.indexOf('renderAll()'));
});

test('renderização é isolada por seção e por gráfico', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /function safeRenderSection\(label,fn\)/);
  assert.match(js, /function safeChart\(id,draw\)/);
  assert.match(js, /chartFailure\(id,error\)/);
  assert.match(js, /safeChart\('chartTopFalhas'/);
  assert.match(js, /safeChart\('chartCorPrev'/);
  assert.match(js, /safeChart\('chartOsMes'/);
});

test('gráficos aguardam layout do navegador antes de desenhar', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /requestAnimationFrame\(\(\)=>requestAnimationFrame\(run\)\)/);
  assert.match(js, /cancelAnimationFrame/);
});

test('render agendado mantém guard do Chart.js e fallback visual', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /function renderCharts\(\)\{\s*if\(!ensureChartRuntime\(\)\)return;/);
  assert.match(js, /function renderChartsNow\(\)\{\s*if\(!ensureChartRuntime\(\)\)return;/);
});

test('hotfix força versão nova do asset no navegador', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(view, /pcm-dashboard\.js\?v=20260921-v11/);
});

test('javascript permanece sintaticamente válido', () => {
  assert.doesNotThrow(() => new Function(read('public/js/pcm-dashboard.js')));
});
