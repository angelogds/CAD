const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const vm=require('node:vm');
const fs=require('node:fs');
let db;
try {db=new (require('better-sqlite3'))(':memory:');}catch{db=new (require('node:sqlite').DatabaseSync)(':memory:');}
require.cache[require.resolve('../database/db')]={exports:db};
for (const m of ['229_automacao_dispositivos','230_automacao_dispositivo_estados','231_automacao_sinaleiros_bancada','232_automacao_bancada_telemetria','233_automacao_bancada_correlacao']) require('../database/migrations/'+m+'.js')();
const http=require('../public/js/automacao-simulador-http.js');
after(()=>db.close());

test('APIs JSON da bancada: 401 sem sessão, 403 sem ADMIN, sem redirect',async()=>{
  const app=express();app.use(express.json());
  let user=null;
  app.use((req,_res,next)=>{req.session={user,automacaoConfigCsrf:'c'};req.flash=()=>{};next()});
  app.use('/automacao',require('../modules/automacao/automacao.routes'));
  const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port+'/automacao/api/simulador/sinaleiros';
  try {
    for (const [url,opt] of [[base+'/status',{}],[base,{method:'POST',headers:{'Content-Type':'application/json','X-CGD-CSRF':'c'},body:'{}'}]]) {
      let r=await fetch(url,{redirect:'manual',...opt});
      assert.equal(r.status,401);assert.match(r.headers.get('content-type'),/json/);
      assert.equal((await r.json()).code,'SESSAO_EXPIRADA');
      user={id:2,role:'MANUTENCAO_SUPERVISOR'};
      r=await fetch(url,{redirect:'manual',...opt});assert.equal(r.status,403);
      user=null;
    }
    user={id:1,role:'ADMIN'};
    const r=await fetch(base+'/status');assert.equal(r.status,200);assert.ok(Array.isArray((await r.json()).digestores));
  } finally{server.close();}
});

const resp=(status,body,ct,extra={})=>({status,ok:status>=200&&status<300,type:'basic',redirected:false,url:'http://x/api',headers:{get:h=>h.toLowerCase()==='content-type'?ct:null},json:async()=>JSON.parse(body),...extra});
async function kindOf(r){global.fetch=async()=>r;try{await http.fetchJson('/x');return null;}catch(e){return e.kind;}}
test('fetchJson classifica sessão, HTML inesperado, falha HTTP e JSON válido',async()=>{
  const orig=global.fetch;
  try {
    assert.equal(await kindOf(resp(401,'{}','application/json')),'sessao');
    assert.equal(await kindOf(resp(302,'','text/html')),'sessao');
    assert.equal(await kindOf(resp(0,'','',{type:'opaqueredirect',ok:false})),'sessao');
    assert.equal(await kindOf(resp(200,'<html>','text/html; charset=utf-8',{url:'http://x/auth/login?next=/a',redirected:true})),'sessao');
    assert.equal(await kindOf(resp(200,'<html>','text/html')),'resposta');
    assert.equal(await kindOf(resp(403,'{}','application/json')),'permissao');
    assert.equal(await kindOf(resp(500,'{}','application/json')),'servidor');
    assert.equal(await kindOf(resp(200,'{bad','application/json')),'resposta');
    assert.equal(await kindOf(resp(200,'{"ok":true}','application/json; charset=utf-8')),null);
    global.fetch=async()=>{throw new Error('boom')};
    await assert.rejects(()=>http.fetchJson('/x'),e=>e.kind==='rede');
  } finally{global.fetch=orig;}
});

function harness(fetchImpl){
  const el=()=>{const e={dataset:{csrf:'t'},style:{},textContent:'',checked:false,disabled:false,value:'1',children:[],
    addEventListener(t,f){(e.l[t]=e.l[t]||[]).push(f)},l:{},querySelector:()=>null,appendChild(c){e.children.push(c)},
    replaceChildren(...c){e.children=c;},colSpan:0};return e;};
  const ids={};['sim-digestores','sim-remote-enable','sim-remote-status','sim-select-digestor','sim-start','sim-remote-rows','sim-pause','sim-reset'].forEach(i=>ids[i]=el());
  ids['sim-start'].disabled=false;
  global.fetch=fetchImpl;
  const intervals=[];
  const ctx={window:{CGDBancadaHttp:http,addEventListener(){}},document:{getElementById:i=>ids[i],createElement:()=>el()},
    fetch:fetchImpl,confirm:()=>true,setInterval:(f,ms)=>{intervals.push({f,ms,on:true});return intervals.length},
    clearInterval:i=>{if(intervals[i-1])intervals[i-1].on=false},console};
  ctx.window.document=ctx.document;
  vm.runInNewContext(fs.readFileSync(__dirname+'/../public/js/automacao-simulador-remoto.js','utf8'),ctx);
  return {ids,intervals};
}
const tick=()=>new Promise(r=>setTimeout(r,20));
test('publicação com HTML 200 não vira "Sincronizado" e interrompe renovações',async()=>{
  const {ids,intervals}=harness(async()=>resp(200,'<html>','text/html'));
  await tick();
  ids['sim-remote-enable'].checked=true;
  ids['sim-remote-enable'].l.change[0]();
  await tick();
  assert.equal(ids['sim-remote-enable'].checked,false);
  assert.doesNotMatch(ids['sim-remote-status'].textContent,/Sincroniza/);
  assert.match(ids['sim-remote-status'].textContent,/Erro na sincronização/);
  assert.ok(intervals.filter(i=>i.ms===2500).every(i=>!i.on));
});
test('sessão expirada mostra mensagem na tabela e no status',async()=>{
  const {ids,intervals}=harness(async()=>resp(401,'{}','application/json'));
  await tick();
  assert.match(ids['sim-remote-rows'].children[0].children[0].textContent,/Sessão expirada — entre novamente no CAD/);
  ids['sim-remote-enable'].checked=true;
  ids['sim-remote-enable'].l.change[0]();
  await tick();
  assert.match(ids['sim-remote-status'].textContent,/Sessão expirada — entre novamente no CAD/);
  assert.equal(ids['sim-remote-enable'].checked,false);
});
test('publicação JSON válida sincroniza',async()=>{
  const {ids}=harness(async(u)=>u.endsWith('/status')?resp(200,'{"digestores":[]}','application/json'):resp(200,'{"ok":true,"estados":[{"digestor_id":1,"fase":"PARADO"}]}','application/json'));
  await tick();
  ids['sim-remote-enable'].checked=true;
  ids['sim-remote-enable'].l.change[0]();
  await tick();
  assert.match(ids['sim-remote-status'].textContent,/Sincronização de bancada/);
  assert.equal(ids['sim-remote-enable'].checked,true);
});
