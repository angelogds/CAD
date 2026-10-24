const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
let db;
try {db=new (require('better-sqlite3'))(':memory:');}catch{db=new (require('node:sqlite').DatabaseSync)(':memory:');}
require.cache[require.resolve('../database/db')]={exports:db};
require('../database/migrations/229_automacao_dispositivos.js')();
require('../database/migrations/230_automacao_dispositivo_estados.js')();
require('../database/migrations/231_automacao_sinaleiros_bancada.js')();
require('../database/migrations/232_automacao_bancada_telemetria.js')();
require('../database/migrations/233_automacao_bancada_correlacao.js')();
const devices=require('../modules/automacao/dispositivos.service');
const bancada=require('../modules/automacao/sinaleiro-bancada.service');
after(()=>db.close());
test('sinaleiro de bancada aceita somente fases previstas e expira',()=>{
  assert.throws(()=>bancada.publish([{digestor_id:1,fase:'ABRIR_VALVULA'}],1),/Fase inválida/);
  assert.throws(()=>bancada.publish([{digestor_id:5,fase:'INICIO'}],1),/Digestor inválido/);
  const token=devices.issueToken('ESP32-DIGESTOR-01',1,1);
  const d=devices.authenticate(token.token);
  bancada.publish([{digestor_id:1,fase:'MEIO'}],1);
  assert.equal(bancada.poll(d,1).fase,'MEIO');
  assert.equal(bancada.poll(d,1).processo_habilitado,false);
  assert.throws(()=>bancada.poll(d,2),e=>e.status===403);
  db.prepare('UPDATE automacao_sinaleiros_bancada SET valid_until_ms=0 WHERE digestor_id=1').run();
  assert.equal(bancada.poll(d,1).fase,'PARADO');
});
test('admin publica sinais; supervisor não e CSRF é obrigatório',async()=>{
  const app=express();app.use(express.json());
  let role='MANUTENCAO_SUPERVISOR';
  app.use((req,_res,next)=>{req.session={user:{id:1,role},automacaoConfigCsrf:'test_csrf'};req.flash=()=>{};next()});
  app.use('/automacao',require('../modules/automacao/automacao.routes'));
  const server=app.listen(0);const url='http://127.0.0.1:'+server.address().port+'/automacao/api/simulador/sinaleiros';
  try {
    const payload=JSON.stringify({estados:[{digestor_id:1,fase:'INICIO'}]});
    const send=(headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json',...headers},body:payload});
    assert.equal((await send({'X-CGD-CSRF':'test_csrf'})).status,403);
    role='ADMIN';
    assert.equal((await send()).status,403);
    const r=await send({'X-CGD-CSRF':'test_csrf'});
    assert.equal(r.status,200);
    assert.equal((await r.json()).estados[0].fase,'INICIO');
  } finally{server.close();}
});
test('ESP32 consulta apenas sinais autorizados usando Bearer',async()=>{
  const app=express();app.use(express.json());
  app.use('/d',require('../modules/automacao/dispositivos.routes'));
  const server=app.listen(0);const url='http://127.0.0.1:'+server.address().port+'/d/sinaleiro-bancada';
  try {
    const token=devices.issueToken('ESP32-DIGESTOR-03',1,3).token;
    bancada.publish([{digestor_id:1,fase:'MEIO'},{digestor_id:3,fase:'FINAL'}],1);
    const send=(tok,id)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer '+tok},body:JSON.stringify({digestor_id:id})});
    assert.equal((await send('errado',3)).status,401);
    assert.equal((await send(token,1)).status,403);
    const response=await send(token,3);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.sinaleiro_bancada.fase,'FINAL');
    assert.deepEqual(body.comandos,[]);
    assert.equal(body.comando_habilitado,false);
  }finally{server.close();}
});
test('versao_fase permanece estável em renovações da mesma fase e avança em transição, PARADO e novo ciclo',()=>{
  const realNow=Date.now;let t=1_000_000;Date.now=()=>t;
  const row=()=>db.prepare('SELECT fase,versao,published_at_ms,valid_until_ms FROM automacao_sinaleiros_bancada WHERE digestor_id=4').get();
  const d=devices.authenticate(devices.issueToken('ESP32-DIGESTOR-04',1,4).token);
  try {
    bancada.publish([{digestor_id:4,fase:'INICIO'}],1);
    const v0=row().versao,pub0=row().published_at_ms;
    for(let i=1;i<=5;i++){
      t+=2500;bancada.publish([{digestor_id:4,fase:'INICIO'}],1);
      const r=row();
      assert.equal(r.versao,v0);assert.equal(r.published_at_ms,pub0);assert.equal(r.valid_until_ms,t+bancada.DURACAO_MS);
      const p=bancada.poll(d,4);
      assert.equal(p.versao_fase,v0);assert.equal(p.fase,'INICIO');assert.ok(p.validade_ms<=6500);
    }
    // transição de fase
    t+=2500;bancada.publish([{digestor_id:4,fase:'MEIO'}],1);
    assert.equal(row().versao,v0+1);assert.equal(row().published_at_ms,t);
    t+=2500;bancada.publish([{digestor_id:4,fase:'MEIO'}],1);
    assert.equal(row().versao,v0+1);
    // PARADO é transição; repetição de PARADO é estável
    t+=2500;bancada.publish([{digestor_id:4,fase:'PARADO'}],1);
    assert.equal(row().versao,v0+2);assert.equal(bancada.poll(d,4).fase,'PARADO');
    t+=2500;bancada.publish([{digestor_id:4,fase:'PARADO'}],1);
    assert.equal(row().versao,v0+2);
    // expiração e reinício do ciclo com a mesma fase
    bancada.publish([{digestor_id:4,fase:'FINAL'}],1);
    assert.equal(row().versao,v0+3);
    t+=bancada.DURACAO_MS+1;
    assert.equal(bancada.poll(d,4).fase,'PARADO');
    assert.equal(row().versao,v0+3);
    bancada.publish([{digestor_id:4,fase:'FINAL'}],1);
    assert.equal(row().versao,v0+4);assert.equal(row().published_at_ms,t);
    assert.equal(bancada.poll(d,4).fase,'FINAL');
  } finally {Date.now=realNow;}
});
