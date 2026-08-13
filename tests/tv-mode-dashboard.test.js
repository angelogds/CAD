const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const service = require('../modules/tv/tv.service');

const view = () => fs.readFileSync('views/tv/modo-tv.ejs', 'utf8');
const source = () => fs.readFileSync('public/js/tv-mode.js', 'utf8');
const css = () => fs.readFileSync('public/css/tv-mode.css', 'utf8');

test('rota oficial /tv, redirect legado e stream pertencem ao módulo oficial', () => {
  const routes = fs.readFileSync('modules/tv/tv.routes.js', 'utf8');
  assert.match(routes, /router\.get\('\/tv'/);
  assert.match(routes, /redirect\(301, '\/tv'\)/);
  assert.match(routes, /router\.get\('\/api\/tv\/stream'/);
});

test('tela oficial possui seis seções, ticker e não possui ações operacionais', () => {
  assert.equal((view().match(/data-tv-screen=/g) || []).length, 6);
  assert.match(view(), /id="tvTickerTrack"/);
  assert.match(view(), /Ativar Modo TV/);
  assert.doesNotMatch(view(), />\s*(Abrir|Iniciar|Editar|Fechar)\s*</);
});

test('rotação, atualização, fallback e alerta usam os intervalos especificados', () => {
  assert.match(view(), /rotationMs:30000/);
  assert.match(view(), /fastRefreshMs:15000/);
  assert.match(view(), /refreshMs:60000/);
  assert.match(view(), /alertMs:60000/);
  assert.match(source(), /new EventSource/);
  assert.match(source(), /startFastPolling/);
  assert.match(source(), /pauseRotation\(\)/);
  assert.match(source(), /resumeRotation\(\)/);
});

test('normalização central trata encerradas, canceladas, emergencial e urgente', () => {
  for (const status of ['FECHADA','FINALIZADA','CONCLUIDA','CONCLUÍDA','CANCELADA','CANCELADO']) {
    assert.equal(service.isOSAtiva({ status }), false);
  }
  assert.equal(service.isOSAtiva({ status: 'EM_ANDAMENTO' }), true);
  assert.equal(service.normalizarPrioridade('EMERGENCIAL'), 'CRITICA');
  assert.equal(service.normalizarPrioridade('URGENTE'), 'CRITICA');
});

test('cliente deduplica por id e abertura, cria baseline e ordena fila crítica', () => {
  const js = source();
  assert.match(js, /incoming\.forEach\(markProcessed\)/);
  assert.match(js, /state\.processed\.has\(osKey\(os\)\)/);
  assert.match(js, /state\.alertQueue\.sort/);
  assert.match(js, /priorities\[a\.prioridade\] - priorities\[b\.prioridade\]/);
  assert.match(js, /localStorage\.setItem\('cgTvProcessedOS'/);
  assert.match(js, /audio\.play\(\)/);
  assert.doesNotThrow(() => new vm.Script(js));
});

test('ticker é formado somente a partir de OS ativas e não sobrepõe conteúdo', () => {
  assert.match(source(), /items\(state\.data\?\.os\)\.filter\(isOSAtiva\)/);
  assert.match(source(), /sortedActiveOS\(\)\.some/);
  assert.match(css(), /grid-template-rows:var\(--header-h\) minmax\(0,1fr\) var\(--ticker-h\)/);
  assert.match(css(), /height:100vh/);
});

test('sem clima ou fotos há fallback visual e nenhum dado demonstrativo', () => {
  assert.match(source(), /Escala ainda não cadastrada/);
  assert.match(source(), /Sem dados suficientes para o ranking/);
  assert.match(source(), /p\.foto \?/);
  const serviceSource = fs.readFileSync('modules/tv/tv.service.js', 'utf8');
  assert.doesNotMatch(serviceSource, /MAINT_FALLBACK|fallbackOS|placeholder-/);
});
