const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('linha de um único período permanece visível', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /const singlePeriod=labels\.length===1/);
  assert.match(js, /showLine:!singlePeriod/);
  assert.match(js, /pointRadius:singlePeriod\?6:2/);
  assert.match(js, /pointBackgroundColor:singlePeriod\?color:'#fff'/);
});

test('modo horizontal realmente usa indexAxis y', () => {
  const js = read('public/js/pcm-dashboard.js');
  assert.match(js, /indexAxis:horizontal\?'y':'x'/);
  assert.match(js, /chartBacklogIdade[\s\S]*horizontal:true/);
});

test('backlog mantém faixas operacionais legíveis', () => {
  const service = read('modules/diretoria/diretoria.manutencao.service.js');
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(service, /0–7 dias/);
  assert.match(service, /8–30 dias/);
  assert.match(service, /31–60 dias/);
  assert.match(service, /Acima de 60 dias/);
  assert.match(view, /Faixas operacionais: 0–7 dias, 8–30 dias, 31–60 dias e acima de 60 dias/);
});

test('rastreabilidade mostra 15 OS por página e pagina pelo payload atual', () => {
  const js = read('public/js/pcm-dashboard.js');
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(js, /ordersPageSize:15/);
  assert.match(js, /function renderOrdersTable\(\)/);
  assert.match(js, /orders\.slice\(start,start\+state\.ordersPageSize\)/);
  assert.match(js, /state\.ordersPage=1/);
  assert.match(view, /id="ordensBody"/);
  assert.match(view, /slice\(0,15\)/);
  assert.match(view, /id="ordensPrev"/);
  assert.match(view, /id="ordensNext"/);
  assert.match(view, /Abrir módulo de OS/);
});

test('cache dos assets foi atualizado', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(view, /pcm-dashboard\.css\?v=20260921-v8/);
  assert.match(view, /pcm-dashboard\.js\?v=20260921-v11/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('javascript continua sintaticamente válido', () => {
  assert.doesNotThrow(() => new Function(read('public/js/pcm-dashboard.js')));
});
