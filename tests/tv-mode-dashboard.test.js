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

test('acessos visíveis abrem exclusivamente /tv em nova aba', () => {
  const dashboard = fs.readFileSync('views/dashboard/index.ejs', 'utf8');
  const sidebar = fs.readFileSync('views/partials/sidebar.ejs', 'utf8');
  const link = dashboard.match(/<a class="op-button ghost"[^>]+>▣ Modo TV<\/a>/)?.[0] || '';
  assert.match(link, /href="\/tv"/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener"/);
  assert.doesNotMatch(dashboard, /tv=1|Sair do modo TV/);
  assert.match(sidebar, /href="\/tv"[^>]*target="_blank"/);
});

test('controller oficial renderiza somente tv/modo-tv', async () => {
  const controller = require('../modules/tv/tv.controller');
  let rendered;
  await controller.page({ session: { user: { id: 1 } } }, { render(viewName, model) { rendered = { viewName, model }; } }, assert.fail);
  assert.equal(rendered.viewName, 'tv/modo-tv');
  assert.equal(rendered.model.layout, false);
});

test('indicadores filtram encerradas e calculam atraso por prazo real', () => {
  const rows = [
    { id: 1, status: 'ABERTA', prioridade: 'CRITICA', prazo: '2026-08-12' },
    { id: 2, status: 'EM_ANDAMENTO', prioridade: 'ALTA', prazo: '2026-08-14' },
    { id: 3, status: 'CONCLUÍDA', prioridade: 'CRITICA', prazo: '2026-08-01', data_conclusao: '2026-08-13' },
    { id: 4, status: 'CANCELADA', prioridade: 'BAIXA', prazo: '2026-08-01' },
  ];
  const result = service.buildOperationalSnapshot(rows, [], { deadlineAvailable: true, now: '2026-08-13T12:00:00Z' });
  assert.equal(result.os.atrasadas, 1);
  assert.equal(result.os.atrasadasDisponivel, true);
  assert.equal(result.os.andamento, 1);
  assert.equal(result.os.concluidasHoje, 1);
  assert.equal(result.preventivas.corretivas, 2);
});

test('ausência de coluna de prazo declara indicador indisponível sem inventar zero', () => {
  const result = service.buildOperationalSnapshot([{ status: 'ABERTA' }], [], { deadlineAvailable: false, now: '2026-08-13T12:00:00Z' });
  assert.equal(result.os.atrasadas, null);
  assert.equal(result.os.atrasadasDisponivel, false);
});

test('responsáveis são resolvidos por todos os vínculos e sem repetição', () => {
  const row = { executor_colaborador_id: 1, auxiliar_colaborador_id: 2, mecanico_user_id: 7, responsavel_user_id: 8 };
  const maps = { colaboradores: new Map([['1', 'Ana'], ['2', 'Bruno']]), users: new Map([['7', 'Ana'], ['8', 'Carlos']]) };
  assert.equal(service.resolveResponsaveis(row, maps), 'Ana, Bruno, Carlos');
});

test('MTBF exige duas falhas e calcula a média entre ocorrências corretivas', () => {
  assert.equal(service.calculateMTBF([{ abertura: '2026-08-01T00:00:00Z' }]), null);
  assert.equal(service.calculateMTBF([
    { abertura: '2026-08-01T00:00:00Z' },
    { abertura: '2026-08-03T00:00:00Z' },
    { abertura: '2026-08-07T00:00:00Z' },
  ]), '3.0 dias');
});

test('snapshot real preserva contrato mesmo quando tabelas opcionais não existem', async () => {
  const snapshot = await service.getSnapshot({ id: 9, nome: 'Operador' });
  assert.ok(Array.isArray(snapshot.os));
  assert.ok(Array.isArray(snapshot.ticker));
  assert.ok(snapshot.operacao.os);
  assert.ok(snapshot.operacao.preventivas);
  assert.ok(snapshot.performance && Object.hasOwn(snapshot.performance, 'mecanicosDisponiveis'));
});
