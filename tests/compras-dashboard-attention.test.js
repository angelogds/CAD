const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const service = require('../modules/compras/compras.service');

const make = (id, status, extra={}) => service.enrichOperational({id,numero:`SC-${id}`,titulo:'Material',status,created_at:extra.created_at||'2026-01-01',itens_count:1,itens_cotados:0,...extra}, '2026-08-14');

test('fonte única normaliza status e mantém todos os estados operacionais ativos',()=>{
  for(const status of [' aberta ','EM COTAÇÃO','REABERTA','COMPRADA','EM_RECEBIMENTO','RECEBIDA_PARCIAL','RECEBIDA_TOTAL']) assert.equal(service.enrichOperational({status}).active,true);
  assert.equal(service.isActiveStatus('FECHADA'),false); assert.equal(service.isActiveStatus('cancelada'),false);
});
test('quatro abertas e duas em cotação aparecem e cards são coerentes',()=>{
  const rows=[1,2,3,4].map(i=>make(i,'ABERTA')).concat([5,6].map(i=>make(i,'em cotação')));
  assert.equal(rows.filter(r=>r.active).length,6); assert.equal(rows.filter(r=>service.matchesCard(r,'abertas')).length,4); assert.equal(rows.filter(r=>service.matchesCard(r,'cotacao')).length,2);
});
test('antiga, reaberta, sem OS e sem responsável continuam ativas',()=>{const r=make(1,'REABERTA',{created_at:'2020-01-01',os_id:null,compras_user_id:null});assert.equal(r.active,true);assert.equal(r.hasOs,false)});
test('fechada vai ao histórico e recebida total só sai após fechamento',()=>{assert.equal(make(1,'FECHADA').active,false);assert.equal(make(2,'RECEBIDA_TOTAL').active,true)});
test('prioridades não definidas têm grupo próprio',()=>{assert.equal(service.priorityGroup(null),'undefined');assert.equal(service.priorityGroup('crítica'),'high');assert.equal(service.priorityGroup('MÉDIA'),'medium')});
test('ausência de prazo não inventa atraso',()=>{const r=make(1,'ABERTA',{previsao_entrega:null});assert.equal(r.overdue,false);assert.equal(r.deadline,'')});
test('prazo real controla atraso e ordenação',()=>{const late=make(1,'ABERTA',{previsao_entrega:'2026-08-01'}),today=make(2,'ABERTA',{previsao_entrega:'2026-08-14'}),none=make(3,'ABERTA');assert.deepEqual([none,today,late].sort(service.operationalSort).map(r=>r.id),[1,2,3])});
test('view oferece fila antes dos gráficos, cards button, abas, filtros, paginação e responsividade',()=>{const view=fs.readFileSync('views/compras/solicitacoes/index.ejs','utf8'),css=fs.readFileSync('public/css/compras-dashboard.css','utf8');assert.ok(view.indexOf('Solicitações ativas para Compras')<view.indexOf('ANDAMENTO GERAL DAS COMPRAS'));for(const text of ['OS VINCULADAS','SOLICITAÇÕES ABERTAS','EM COTAÇÃO','EM RECEBIMENTO','RECEBIDAS','ATRASADAS','Fechadas e histórico','Sem prioridade definida','Prazo a definir','[10,20,50]','Limpar filtros'])assert.match(view,new RegExp(text));assert.match(view,/<button[^>]+metric-card/);assert.match(view,/aria-pressed/);assert.match(view,/--metric-color/);assert.match(view,/class="request-columns"/);assert.match(css,/font-family:\s*inherit/);assert.match(css,/\.request-columns/);assert.match(css,/:focus-visible/);assert.match(css,/\.request-row\{[^}]*user-select:none/);assert.match(css,/@media\s*\(max-width:\s*560px\)/)});
