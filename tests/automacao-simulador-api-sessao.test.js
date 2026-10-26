const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
let db;
try {db=new (require('better-sqlite3'))(':memory:');}catch{db=new (require('node:sqlite').DatabaseSync)(':memory:');}
require.cache[require.resolve('../database/db')]={exports:db};
for(const m of ['229_automacao_dispositivos','230_automacao_dispositivo_estados','231_automacao_sinaleiros_bancada','232_automacao_bancada_telemetria','233_automacao_bancada_correlacao','235_automacao_temperatura_real','236_automacao_sensor_simulado'])require('../database/migrations/'+m+'.js')();
const {fetchJson}=require('../public/js/automacao-simulador-http.js');
after(()=>db.close());

test('API da bancada: 401 sem sessão, supervisor autorizado e configuração ADMIN, sem redirects',async()=>{
  const app=express();app.use(express.json());
  let user=null;
  app.use((req,_res,next)=>{req.session={user,automacaoConfigCsrf:'csrf'};req.flash=()=>{};next()});
  app.use('/automacao',require('../modules/automacao/automacao.routes'));
  const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port+'/automacao/api';
  try{
    const urls=[['GET','/simulador/sinaleiros/status'],['POST','/simulador/sinaleiros'],['GET','/dispositivos']];
    for(const [method,p] of urls){
      const r=await fetch(base+p,{method,redirect:'manual',headers:{'Content-Type':'application/json','X-CGD-CSRF':'csrf'},body:method==='POST'?'{}':undefined});
      assert.equal(r.status,401,p);assert.match(r.headers.get('content-type'),/json/);
      assert.equal((await r.json()).code,'SESSAO_EXPIRADA');
    }
    user={id:2,role:'MANUTENCAO_SUPERVISOR'};
    const r2=await fetch(base+'/simulador/sinaleiros/status',{redirect:'manual'});
    assert.equal(r2.status,200);assert.equal((await r2.json()).digestores.length,4);
    const adminOnly=await fetch(base+'/dispositivos',{redirect:'manual'});
    assert.equal(adminOnly.status,403);assert.equal((await adminOnly.json()).code,'SEM_PERMISSAO');
    user={id:1,role:'ADMIN'};
    const ok=await fetch(base+'/simulador/sinaleiros/status',{redirect:'manual'});
    assert.equal(ok.status,200);assert.ok(Array.isArray((await ok.json()).digestores));
    const semCsrf=await fetch(base+'/simulador/sinaleiros',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"estados":[]}'});
    assert.equal(semCsrf.status,403);
  }finally{server.close();}
});

const resp=(status,body,{type='application/json',redirected=false,rtype='basic'}={})=>({
  status,ok:status>=200&&status<300,redirected,type:rtype,
  headers:{get:k=>k.toLowerCase()==='content-type'?type:null},
  json:async()=>{if(typeof body==='string')return JSON.parse(body);return body;},
});
const call=(r)=>fetchJson('/x',{},async()=>r);

test('cliente: sessão expirada (401, redirect, HTML 200 de login)',async()=>{
  await assert.rejects(call(resp(401,{ok:false})),{kind:'SESSAO_EXPIRADA'});
  await assert.rejects(call(resp(0,'',{rtype:'opaqueredirect'})),{kind:'SESSAO_EXPIRADA'});
  await assert.rejects(call(resp(200,'<html>',{type:'text/html',redirected:true})),{kind:'SESSAO_EXPIRADA'});
  await assert.rejects(call(resp(302,'')),{kind:'SESSAO_EXPIRADA'});
});
test('cliente: HTML 200 inesperado nunca é sucesso',async()=>{
  await assert.rejects(call(resp(200,'<!DOCTYPE html>',{type:'text/html; charset=utf-8'})),{kind:'RESPOSTA_INVALIDA'});
  await assert.rejects(call(resp(200,'{quebrado',{type:'application/json'})),{kind:'RESPOSTA_INVALIDA'});
});
test('cliente: JSON válido retorna dados; ok:false vira erro',async()=>{
  const d=await call(resp(200,{ok:true,digestores:[]},{type:'application/json; charset=utf-8'}));
  assert.deepEqual(d.digestores,[]);
  await assert.rejects(call(resp(200,{ok:false,error:'Fase inválida'})),{kind:'SERVIDOR'});
});
test('cliente: falhas HTTP, 403 e rede',async()=>{
  await assert.rejects(call(resp(500,{ok:false})),e=>e.kind==='SERVIDOR'&&/500/.test(e.message));
  await assert.rejects(call(resp(403,{ok:false,code:'SEM_PERMISSAO'})),{kind:'SEM_PERMISSAO'});
  await assert.rejects(fetchJson('/x',{},async()=>{throw new TypeError('fail');}),{kind:'REDE'});
});
test('cliente: força redirect manual e same-origin',async()=>{
  let seen;await fetchJson('/x',{method:'POST'},async(u,o)=>{seen=o;return resp(200,{ok:true});});
  assert.equal(seen.redirect,'manual');assert.equal(seen.credentials,'same-origin');assert.equal(seen.method,'POST');
});

test('ADMIN com CSRF inválido: 403 CSRF_INVALIDO, mensagem própria e sem anunciar sincronização',async()=>{
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{req.session={user:{id:1,role:'ADMIN'},automacaoConfigCsrf:'csrf-atual'};req.flash=()=>{};next()});
  app.use('/automacao',require('../modules/automacao/automacao.routes'));
  const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port+'/automacao/api/simulador/sinaleiros';
  try{
    for(const h of [{'X-CGD-CSRF':'antigo'},{}]){
      const r=await fetch(base,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',...h},body:'{"estados":[]}'});
      assert.equal(r.status,403);assert.equal((await r.json()).code,'CSRF_INVALIDO');
    }
    // Cliente: erro dedicado, distinto de SEM_PERMISSAO.
    await assert.rejects(fetchJson(base,{method:'POST',headers:{'Content-Type':'application/json','X-CGD-CSRF':'antigo'},body:'{"estados":[]}'}),
      e=>e.kind==='CSRF_INVALIDO'&&e.message==='Sessão de sincronização alterada — recarregue a página'&&!/permiss/i.test(e.message));
    // Script da tela: interrompe e não anuncia sincronização.
    const els={};const el=(id)=>els[id]||(els[id]={id,checked:true,dataset:{csrf:'antigo'},value:'1',disabled:false,textContent:'',
      addEventListener(){},querySelector:()=>null,replaceChildren(){},setAttribute(){},appendChild(){},colSpan:0});
    ['sim-digestores','sim-remote-enable','sim-remote-status','sim-select-digestor','sim-start','sim-remote-rows','sim-pause','sim-reset'].forEach(el);
    els['sim-digestores'].querySelector=()=>null;
    const timers=[];
    const win={CGDSimHttp:{fetchJson:(u,o)=>fetchJson(base,o),MSG:{}},addEventListener(){}};
    const sandbox={window:win,document:{getElementById:(i)=>els[i]||null,createElement:()=>el('x'+Math.random())},
      setInterval:(f)=>{timers.push(f);return timers.length;},clearInterval(){},confirm:()=>true,Object,Error};
    let change;els['sim-remote-enable'].addEventListener=(ev,f)=>{if(ev==='change')change=f;};
    require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('../public/js/automacao-simulador-remoto.js'),'utf8'),sandbox);
    change();await new Promise(r=>setTimeout(r,300));
    const st=els['sim-remote-status'].textContent;
    assert.match(st,/Sessão de sincronização alterada — recarregue a página/);
    assert.doesNotMatch(st,/Sincronização de bancada|Sem permissão/);
    assert.equal(els['sim-remote-enable'].checked,false);
  }finally{server.close();}
});
