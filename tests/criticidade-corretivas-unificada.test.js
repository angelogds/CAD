const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const Database=require('better-sqlite3');
const {createOperationalCriticalityService}=require('../modules/dashboard/operational-criticality.service');
const migrate=require('../database/migrations/245_criticidade_base_corretivas');
const root=path.resolve(__dirname,'..');
const filters={inicio:'2026-10-05',fim:'2026-11-03'};
function fixture(t,{view=true}={}) {
 const db=new Database(':memory:');t.after(()=>db.close());
 db.exec(`CREATE TABLE equipamentos(id INTEGER PRIMARY KEY,nome TEXT,setor TEXT,criticidade TEXT,ativo INTEGER,status_operacional TEXT);
 CREATE TABLE os(id INTEGER PRIMARY KEY,equipamento_id INTEGER,equipamento TEXT,descricao TEXT,tipo TEXT,tipo_manutencao TEXT DEFAULT 'CORRETIVA',origem TEXT,preventiva_execucao_id INTEGER,status TEXT,grau TEXT,opened_at TEXT,closed_at TEXT);
 CREATE TABLE preventiva_execucoes(id INTEGER PRIMARY KEY,os_id INTEGER);
 CREATE TABLE pcm_lubrificacao_os_programadas(id INTEGER PRIMARY KEY,os_id INTEGER);
 CREATE TABLE pcm_lubrificacao_execucoes(id INTEGER PRIMARY KEY,os_id INTEGER);
 INSERT INTO equipamentos VALUES(1,'Prensa atual','RECICLAGEM','MEDIA',1,'ATIVO'),(2,'Somente preventiva','RECICLAGEM','ALTA',1,'ATIVO'),(3,'Moinho com serviço antigo','RECICLAGEM','ALTA',1,'ATIVO'),(4,'Equipamento substituído','RECICLAGEM','ALTA',0,'INATIVO'),(5,'Sem tipo de manutenção','RECICLAGEM','MEDIA',1,'ATIVO'),(6,'Corretivas já encerradas','FRIGORÍFICO','ALTA',1,'ATIVO');`);
 let next=1;
 function add({eq=1,tipo='CORRETIVA',manut='CORRETIVA',origem=null,exec=null,status='CONCLUIDA',priority='MEDIA',date='2026-11-02 12:00:00',closed='2026-11-02 16:30:00'}={}) {
  const id=next++;db.prepare('INSERT INTO os VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,eq,'Nome antigo','Serviço',tipo,manut,origem,exec,status,priority,date,closed);return id;
 }
 const a=add({date:'2026-10-27 12:00:00',closed:'2026-10-27 16:30:00'}),b=add({status:'ABERTA',priority:'ALTA',closed:null});
 for(let i=0;i<18;i++)add({tipo:'PREVENTIVA',priority:'CRITICA',closed:'2026-11-03 16:00:00'});
 add({eq:2,tipo:'PREVENTIVA',status:'ABERTA',priority:'CRITICA',closed:null});
 add({tipo:'CORRETIVA',manut:'PREVENTIVA'});add({tipo:'CORRETIVA',origem:'LUBRIFICACAO'});add({tipo:'CORRETIVA',origem:'Lubrificação'});add({tipo:'CORRETIVA',exec:19});
 const linked=add();db.prepare('INSERT INTO preventiva_execucoes VALUES(1,?)').run(linked);
 const lub=add();db.prepare('INSERT INTO pcm_lubrificacao_os_programadas VALUES(1,?)').run(lub);
 const lubExec=add();db.prepare('INSERT INTO pcm_lubrificacao_execucoes VALUES(1,?)').run(lubExec);
 for(let i=0;i<21;i++)add({eq:3,date:'2026-08-02 12:00:00',closed:'2026-08-02 15:00:00'});
 add({eq:4});add({eq:5,tipo:'',manut:''});add({tipo:'CORRETIVA',status:'CANCELADA'});
 add({tipo:'ELETRICA'});
 add({eq:6,date:'2026-10-10 12:00:00',closed:'2026-10-10 14:00:00',priority:'CRITICA'});
 add({eq:6,date:'2026-10-20 12:00:00',closed:'2026-10-20 14:00:00',priority:'CRITICA'});
 const context={db,tableExists:n=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n))};
 if(view){migrate(context);migrate(context);}
 return {db,service:createOperationalCriticalityService(db),add,context,a,b};
}
function loadTV(db,criticality) {
 const filename=path.join(root,'modules/tv/tv.service.js'),requireReal=createRequire(filename),module={exports:{}};
 const overrides={
  '../../database/db':db,'../dashboard/operational-criticality.service':criticality,
  '../dashboard/dashboard.service':{},'../diretoria/diretoria.manutencao.service':{getDashboard:()=>({})},
  '../lubrificacao/lubrificacao-semana.service':{getRelatorioSemana:()=>({grupos:[]})},'./weather.service':{getWeather:async()=>({available:false,week:[]})},
 };
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:n=>Object.hasOwn(overrides,n)?overrides[n]:requireReal(n),console,URLSearchParams});
 return module.exports;
}

test('base corretiva ignora default legado, origens/vínculos preventivos, canceladas e tipos desconhecidos',t=>{
 const {db,service}=fixture(t);const d=service.getDashboard(filters);
 assert.deepEqual(d.ranking.map(r=>[r.equipamento_id,r.total_falhas]),[[6,2],[1,2]]);
 assert.equal(d.resumo.falhas,4);assert.equal(d.resumo.reincidencias,2);
 assert.equal(d.osResumo.tempo_medio_fechamento_horas,(4.5+2+2)/3);
 assert.equal(d.osResumo.abertas,1);assert.equal(d.osResumo.finalizadas_periodo,3);
 assert.equal(d.ranking.find(r=>r.equipamento_id===1).frequencia_media,'6.0 dias');
 assert.equal(d.serie_falhas.reduce((n,s)=>n+s.falhas,0),4);
 assert.ok(db.prepare('SELECT COUNT(*) n FROM os WHERE tipo=\'PREVENTIVA\'').get().n>0);
 assert.equal(db.prepare('SELECT tipo_manutencao FROM os WHERE tipo=\'PREVENTIVA\' LIMIT 1').get().tipo_manutencao,'CORRETIVA','histórico original preservado');
});

test('mesmo predicado funciona antes da view e a migration não apaga o histórico',t=>{
 const {db,service,context}=fixture(t,{view:false});const before=service.getDashboard(filters),total=db.prepare('SELECT COUNT(*) n FROM os').get().n;
 migrate(context);assert.deepEqual(service.getDashboard(filters).ranking,before.ranking);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM os').get().n,total);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='view' AND name='vw_criticidade_os_corretivas'").get().n,1);
});

test('TV e painel usam mesmos equipamentos, contagens, período e intervalo, sem limite de 500 OS',async t=>{
 const {db,service,add}=fixture(t);for(let i=0;i<520;i++)add({eq:2,tipo:'PREVENTIVA'});
 const tv=loadTV(db,service),dashboard=service.getDashboard(filters),snapshot=await tv.getSnapshot(null,filters);
 assert.deepEqual(Array.from(snapshot.operacao.equipamentos,r=>[r.equipamento_id,r.falhas,r.reincidencias,r.mtbf]),dashboard.ranking.map(r=>[r.equipamento_id,r.total_falhas,r.reincidencias,r.frequencia_media]));
 assert.equal(snapshot.operacao.criticidade.resumo.falhas,dashboard.resumo.falhas);
 assert.equal(snapshot.operacao.criticidade.filters.start,filters.inicio);
 assert.equal(snapshot.operacao.criticidade.filters.end,filters.fim);
 const sector=await tv.getSnapshot(null,{...filters,setor:'FRIGORÍFICO'});
 assert.deepEqual(Array.from(sector.operacao.equipamentos,r=>r.equipamento_id),[6]);
});

test('fechamento se reflete imediatamente na TV e não transforma histórico encerrado em pendência crítica',async t=>{
 const {db,service,b}=fixture(t),tv=loadTV(db,service);
 let d=service.getDashboard(filters);assert.equal(d.resumo.criticos_atuais,1);assert.equal(d.resumo.encerrados,1);
 assert.equal(d.ranking.find(r=>r.equipamento_id===6).criticidade_atual,null);
 const first=await tv.getSnapshot(null,filters);assert.equal(first.operacao.equipamentos.find(r=>r.equipamento_id===1).corretivas_abertas,1);
 db.prepare("UPDATE os SET status='CONCLUIDA',closed_at='2026-11-02 17:00:00' WHERE id=?").run(b);
 const second=await tv.getSnapshot(null,filters);assert.equal(second.operacao.equipamentos.find(r=>r.equipamento_id===1).corretivas_abertas,0);
 d=service.getDashboard(filters);assert.equal(d.resumo.criticos_atuais,0);assert.equal(d.resumo.falhas,4);assert.equal(d.ranking[0].situacao_atual,'SEM_CORRETIVA_ABERTA');
 assert.ok(d.intervencoes.every(i=>i.classificacao==='Acompanhamento histórico'));
});

test('equipamento inativo exige filtro explícito; serviço antigo sai do recorte e segue acessível no histórico',t=>{
 const {service}=fixture(t);
 assert.equal(service.getDashboard(filters).ranking.some(r=>r.equipamento_id===3||r.equipamento_id===4),false);
 assert.equal(service.getDashboard({...filters,ativo:'0'}).ranking[0].equipamento_id,4);
 const old=service.getDashboard({inicio:'2026-08-01',fim:'2026-08-31'});assert.equal(old.ranking[0].equipamento_id,3);assert.equal(old.ranking[0].total_falhas,21);
 const actual=service.getDashboard(filters).ranking.find(r=>r.equipamento_id===1),url=new URL(actual.historico_url,'http://localhost');
 assert.equal(url.pathname,'/dashboard/criticidade/equipamentos/1');
 const detail=service.getDetalhe(1,Object.fromEntries(url.searchParams));assert.equal(detail.ocorrencias.length,2);assert.ok(detail.ocorrencias.every(r=>r.tipo==='CORRETIVA'));
});

test('datas são civis do Brasil, sem arredondar horas do fechamento nem o intervalo entre corretivas',t=>{
 const {service,add}=fixture(t);
 add({eq:1,date:'2026-11-04 01:00:00',closed:'2026-11-04 02:30:00'});
 const today=service.getDashboard({inicio:'2026-11-03',fim:'2026-11-03'});
 assert.equal(today.resumo.falhas,1);assert.equal(today.osResumo.tempo_medio_fechamento_horas,1.5);
 assert.equal(today.serie_falhas[0].falhas,1);
 assert.doesNotThrow(()=>service.getDashboard({inicio:'inválido',fim:'2026-99-99'}));
 const reverse=service.parseFilters({inicio:'2026-11-03',fim:'2026-10-05'});assert.equal(reverse.start,'2026-10-05');assert.equal(reverse.end,'2026-11-03');
});

test('service worker ignora cache de painel e snapshot da TV e limpa cópias antigas na ativação',async()=>{
 const handlers={},removed=[];let intercepted=false;
 const cached=['https://app.example/dashboard','https://app.example/api/tv/snapshot','https://app.example/tv?periodo=7d','https://app.example/css/app.css'];
 const context={self:{location:{origin:'https://app.example'},addEventListener:(n,fn)=>handlers[n]=fn,clients:{claim:async()=>{}}},URL,console,caches:{keys:async()=>['campo-do-gado-v2-mobile'],open:async()=>({keys:async()=>cached.map(url=>({url})),delete:async req=>removed.push(req.url)})}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'public/service-worker.js'),'utf8'),context);
 handlers.fetch({request:{method:'GET',url:'https://app.example/api/tv/snapshot'},respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 handlers.fetch({request:{method:'GET',url:'https://app.example/dashboard'},respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 let done;handlers.activate({waitUntil:p=>done=p});await done;
 assert.deepEqual(removed,cached.slice(0,3));
});

test('janelas relativas continuam móveis e períodos explícitos são identificados como personalizados',t=>{
 const {service}=fixture(t);
 const relative=service.parseFilters({periodo:'7d'});assert.equal(relative.relative,true);assert.equal(relative.periodo,'7');assert.equal(relative.days,7);
 const custom=service.parseFilters(filters);assert.equal(custom.relative,false);assert.equal(custom.periodo,'personalizado');
 assert.equal(service.parseFilters({periodo:'mes'}).start.slice(8),'01');
});
