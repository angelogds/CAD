const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const service = require('../modules/dashboard/operational-dashboard.service');

const now = new Date('2026-08-13T12:00:00Z');
const period = service.resolvePeriod({ periodo:'7d' }, now);

test('períodos e período personalizado são normalizados em America/Bahia', () => {
  assert.equal(period.start, '2026-08-07');
  assert.equal(period.end, '2026-08-13');
  assert.deepEqual(service.resolvePeriod({periodo:'personalizado',inicio:'2026-08-10',fim:'2026-08-01'}, now), {key:'personalizado',start:'2026-08-01',end:'2026-08-10',label:'01/08/2026 a 10/08/2026'});
});

test('OS ativas não duplicam atraso e distribuição soma exatamente 100%', () => {
  const data = service.buildOS({items:[
    {id:1,status:'ABERTA',abertura:'2026-08-01',prazo:'2026-08-10',setor:'A'},
    {id:2,status:'ANDAMENTO',abertura:'2026-08-02',setor:'A'},
    {id:3,status:'PAUSADA',abertura:'2026-08-03',updated_at:'2026-08-12',motivo_pausa:'Peça',setor:'A'},
    {id:4,status:'FECHADA',abertura:'2026-08-01',setor:'A'},
  ]}, period, now, 'A');
  assert.equal(data.totalAtivas, 3);
  assert.equal(data.counts.atrasadas, 1);
  assert.equal(data.items[0].id, 1);
  const paused=data.items.find(item=>item.id===3);
  assert.equal(paused.motivo_pausa, 'Peça');
  assert.ok(paused.tempo_pausado_horas > 0);
  assert.equal(data.distribution.reduce((sum,item)=>sum+item.percent,0), 100);
  assert.equal(data.distribution.some(item=>item.key==='atrasadas'), false);
});

test('preventivas usam datas reais, ordenam vencidas e preservam zeros de criticidade', () => {
  const data=service.buildPreventivas({items:[
    {id:2,status:'PENDENTE',data_prevista:'2026-08-15',criticidade:'ALTA',responsavel_exibicao:'Ana'},
    {id:1,status:'PENDENTE',data_prevista:'2026-08-12',criticidade:'BAIXA',responsavel_exibicao:'-'},
    {id:3,status:'PENDENTE',data_prevista:'2026-08-13',criticidade:'CRITICA',responsavel_exibicao:'Bia'},
  ],criticidade:{BAIXA:1,MEDIA:0,ALTA:1,CRITICA:1}},now);
  assert.equal(data.items[0].id,1); assert.equal(data.deadlines.vencidas,1); assert.equal(data.deadlines.hoje,1); assert.equal(data.deadlines.semana,1); assert.equal(data.deadlines.semResponsavel,1); assert.equal(data.criticidade.MEDIA,0);
});

test('indicadores desconhecidos não são convertidos em zero', () => {
  const indicators=service.maintenanceIndicators([], {items:[]});
  assert.equal(indicators.mttr,null); assert.equal(indicators.mtbf,null); assert.equal(indicators.availability,null); assert.equal(indicators.recurrenceRate,null);
});

test('MTTR e cumprimento preventivo usam somente amostras concluídas confiáveis', () => {
  const indicators=service.maintenanceIndicators([{status:'FECHADA',opened_at:'2026-08-01T00:00:00Z',closed_at:'2026-08-01T04:00:00Z'}], {items:[{status:'CONCLUIDA',data_prevista:'2026-08-05',concluida_em:'2026-08-04'}]});
  assert.equal(indicators.mttr,4); assert.equal(indicators.preventiveCompliance,100);
});

test('view mantém ordem, ações, filtros, estados vazios e modo TV', () => {
  const view=fs.readFileSync('views/dashboard/index.ejs','utf8');
  const css=fs.readFileSync('public/css/operational-dashboard.css','utf8');
  const js=fs.readFileSync('public/js/operational-dashboard.js','utf8');
  assert.ok(view.indexOf('id="os"') < view.indexOf('id="criticidade"'));
  assert.ok(view.indexOf('id="criticidade"') < view.indexOf('id="preventivas"'));
  for(const text of ['Todos os setores','Personalizado','DISTRIBUIÇÃO DAS OS','FALHAS — ÚLTIMOS 30 DIAS','Nenhuma demanda em andamento.']) assert.match(view,new RegExp(text));
  for(const removed of ['ATENÇÃO IMEDIATA','INDICADORES DE DESEMPENHO DA MANUTENÇÃO','Tempo aberto','Motivo não informado']) assert.doesNotMatch(view,new RegExp(removed));
  assert.match(view,/\.slice\(0,5\)/); assert.match(view,/\.slice\(0,6\)/);
  assert.match(view,/action="\/os\/<%= o\.id %>\/status"/);
  assert.match(js,/setInterval\(\(\) => location\.reload\(\), 60000\)/);
  assert.match(css,/@media\(max-width:700px\)/); assert.match(css,/grid-template-columns:repeat\(2,1fr\)/);
});
