const { test, after } = require('node:test');
const assert = require('node:assert/strict');
let db;
try { db = new (require('better-sqlite3'))(':memory:'); } catch { db = new (require('node:sqlite').DatabaseSync)(':memory:'); }
require.cache[require.resolve('../database/db')] = { exports: db };
for (const m of ['229_automacao_dispositivos','230_automacao_dispositivo_estados','231_automacao_sinaleiros_bancada','232_automacao_bancada_telemetria','233_automacao_bancada_correlacao','235_automacao_temperatura_real','236_automacao_sensor_simulado']) require('../database/migrations/'+m+'.js')();
const devices = require('../modules/automacao/dispositivos.service');
const tel = require('../modules/automacao/bancada-telemetria.service');
const bancada = require('../modules/automacao/sinaleiro-bancada.service');
const { classifyTemperature } = require('../modules/automacao/temperatura-sinaleiro');
after(()=>db.close());
const dev = () => devices.authenticate(devices.issueToken('ESP32-DIGESTOR-01',1,1).token);
const status = () => tel.status().digestores[0];
function report(d,temp=100) {
  bancada.publish([{digestor_id:1,fase:'MEIO',temperatura_c:temp}],1);
  const p=bancada.poll(d,1);
  devices.recordContact(d,{...p,origem:'SIMULACAO',fase_recebida:p.fase,fase_aplicada:p.fase,sensor_status:'SIMULADO',sensor_tipo:'SIMULADO'});
  return p;
}

test('computador é sensor simulado: faixa, temperatura e pronto chegam pelo ESP32 sem PT100',()=>{
  const d=dev();
  for (const temp of [25,75,100,125]) {
    const p=report(d,temp);const s=status();
    assert.equal(s.temperatura_c,temp);assert.equal(s.cor_sinaleiro,p.cor_sinaleiro);assert.equal(s.sensor_status,'SIMULADO');
    assert.equal(s.sensor_tipo,'SIMULADO');assert.equal(s.origem,'SIMULACAO');assert.equal(s.simulacao_atual,true);
    assert.equal(s.medicao_atual,false);assert.equal(s.pt100_habilitado,false);assert.equal(s.timestamp_medicao,null);
    assert.equal(s.pronto_descarga,temp>120);
    assert.equal(JSON.parse(db.prepare('SELECT last_payload FROM automacao_dispositivos WHERE id=?').get(d.id).last_payload).sensor_status,'SIMULADO');
  }
});

test('PARADO e vencimento do comando cancelam sensor simulado e pronto mesmo com ping recente',()=>{
  const d=dev();report(d,125);
  db.prepare('UPDATE automacao_sinaleiros_bancada SET valid_until_ms=? WHERE digestor_id=1').run(Date.now()-1);
  devices.recordPing(d);
  let s=status();assert.equal(s.simulacao_atual,false);assert.equal(s.sensor_status,'SEM_SINAL');assert.equal(s.temperatura_c,null);assert.equal(s.pronto_descarga,false);
  report(d,125);
  devices.recordContact(d,{origem:'SIMULACAO',fase:'PARADO',fase_aplicada:'PARADO',temperatura_c:125,sensor_status:'SEM_SENSOR'});
  s=status();assert.equal(s.sensor_status,'SEM_SINAL');assert.equal(s.temperatura_c,null);assert.equal(s.pronto_descarga,false);
});

test('SIM valida tupla completa e nunca converte ausência de origem em medição',()=>{
  const valid={origem:'SIMULACAO',fase:'MEIO',temperatura_c:100,...classifyTemperature(100)};
  for (const b of [{...valid,cor_sinaleiro:'VERDE'},{...valid,faixa_temperatura:'PRONTO'},{...valid,pronto_descarga:true},{...valid,temperatura_c:'100'},{...valid,sensor_status:'SEM_SINAL'},{...valid,sensor_status:'FALHA'}]) assert.throws(()=>tel.normalizeReading(b),e=>e.status===400);
  const legacy=tel.normalizeReading({fase:'INICIO',temperatura_c:100,sensor_tipo:'PT100',sensor_status:'VALIDO'});
  assert.equal(legacy.temperatura_c,null);assert.equal(legacy.sensor_tipo,null);assert.equal(legacy.sensor_status,'SEM_SENSOR');
  const none=tel.normalizeReading({origem:'SIMULACAO',fase:'PARADO'});
  assert.equal(none.sensor_status,'SEM_SINAL');assert.equal(none.temperatura_c,null);assert.equal(none.pronto_descarga,false);
});

test('SIM sem confirmação ou versão antiga não aparece como valor atual',()=>{
  const d=dev();const old=report(d,125);
  bancada.publish([{digestor_id:1,fase:'INICIO',temperatura_c:25}],1);
  let s=status();assert.equal(s.sensor_status,'SEM_SINAL');assert.equal(s.pronto_descarga,false);
  devices.recordContact(d,{...old,origem:'SIMULACAO',fase_recebida:old.fase,fase_aplicada:old.fase,sensor_status:'SIMULADO'});
  s=status();assert.equal(s.simulacao_atual,false);assert.equal(s.temperatura_c,null);assert.equal(s.pronto_descarga,false);
});

test('SIMULADO não é sensor_status REAL e não habilita PT100',()=>{
  assert.throws(()=>tel.normalizeReading({origem:'REAL',sensor_tipo:'PT100',sensor_status:'SIMULADO',temperatura_c:null,timestamp_medicao:null,faixa_temperatura:'SENSOR_INDISPONIVEL',cor_sinaleiro:'DESLIGADO',pronto_descarga:false}),e=>e.status===400);
});

test('teste local sem comando CAD mantém simulação atual por até 15 s',()=>{
  const d=dev();
  devices.recordContact(d,{origem:'SIMULACAO',fonte_simulacao:'LOCAL',fase:'MEIO',temperatura_c:100,...classifyTemperature(100),sensor_status:'SIMULADO'});
  let s=status();assert.equal(s.fonte_simulacao,'LOCAL');assert.equal(s.simulacao_atual,true);assert.equal(s.temperatura_c,100);assert.equal(s.sensor_status,'SIMULADO');
  db.prepare("UPDATE automacao_bancada_telemetria SET reported_at=datetime('now','-16 seconds') WHERE device_pk=?").run(d.id);
  s=status();assert.equal(s.simulacao_atual,false);assert.equal(s.sensor_status,'SEM_SINAL');assert.equal(s.temperatura_c,null);
});

test('purgas virtuais são filtradas, versionadas e expiram fechadas sem armamento remoto',()=>{
  const d=dev();
  const state={digestor_id:1,fase:'MEIO',temperatura_c:100,aquecimento_simulado:true,purgadores_simulados:{camisa:'ABERTO',eixo:'FECHADO',gpio:25},armar_real:true};
  bancada.publish([state],1);const before=bancada.poll(d,1);
  assert.equal(before.estado_simulacao_disponivel,true);assert.equal(before.aquecimento_simulado,true);assert.deepEqual(before.purgadores_simulados,{camisa:'ABERTO',eixo:'FECHADO'});
  assert.equal(before.armar_real,undefined);assert.equal(before.purgadores_simulados.gpio,undefined);
  devices.recordContact(d,{...before,origem:'SIMULACAO',fase_recebida:before.fase,fase_aplicada:before.fase,sensor_status:'SIMULADO'});
  let s=status();assert.equal(s.estado_simulacao_disponivel,true);assert.equal(s.purgadores_simulados.camisa,'ABERTO');
  bancada.publish([{...state,purgadores_simulados:{camisa:'FECHADO',eixo:'ABERTO'}}],1);
  const next=bancada.poll(d,1);assert.equal(next.versao_fase,before.versao_fase+1);
  s=status();assert.equal(s.estado_simulacao_disponivel,false);assert.deepEqual(s.purgadores_simulados,{camisa:'FECHADO',eixo:'FECHADO'});
  db.prepare('UPDATE automacao_sinaleiros_bancada SET valid_until_ms=0 WHERE digestor_id=1').run();
  const expired=bancada.poll(d,1);assert.equal(expired.estado_simulacao_disponivel,false);assert.equal(expired.aquecimento_simulado,false);assert.deepEqual(expired.purgadores_simulados,{camisa:'FECHADO',eixo:'FECHADO'});
  bancada.publish([{digestor_id:1,fase:'MEIO'}],1);assert.equal(bancada.poll(d,1).estado_simulacao_disponivel,false);
  assert.throws(()=>bancada.publish([{...state,aquecimento_simulado:'sim'}],1),e=>e.status===400);
  assert.throws(()=>bancada.publish([{...state,purgadores_simulados:{camisa:'ABRIR_VALVULA',eixo:'FECHADO'}}],1),e=>e.status===400);
  assert.throws(()=>bancada.publish([{...state,estado_simulacao_disponivel:'false'}],1),e=>e.status===400);
  assert.throws(()=>bancada.publish([{digestor_id:1,fase:'MEIO',temperatura_c:100,estado_simulacao_disponivel:true}],1),e=>e.status===400);
  bancada.publish([{...state,estado_simulacao_disponivel:false}],1);
  const unavailable=bancada.poll(d,1);assert.equal(unavailable.estado_simulacao_disponivel,false);assert.equal(unavailable.aquecimento_simulado,false);assert.deepEqual(unavailable.purgadores_simulados,{camisa:'FECHADO',eixo:'FECHADO'});
  require('../database/migrations/236_automacao_sensor_simulado')();
});

test('HTTP publica do computador e poll retorna envelope V8 SIMULACAO com temperatura e estados virtuais',async()=>{
  const express=require('express');const app=express();app.use(express.json());
  app.use('/d',require('../modules/automacao/dispositivos.routes'));
  app.use((req,_res,next)=>{req.session={user:{id:1,role:'ADMIN'},automacaoConfigCsrf:'test'};req.flash=()=>{};next();});
  app.use('/automacao',require('../modules/automacao/automacao.routes'));
  const token=devices.issueToken('ESP32-DIGESTOR-01',1,1).token;
  const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port;
  try {
    const expected=require('./fixtures/esp32/cad-simulation-envelope.json').sinaleiro_bancada;
    const p=await fetch(base+'/automacao/api/simulador/sinaleiros',{method:'POST',headers:{'content-type':'application/json','x-cgd-csrf':'test'},body:JSON.stringify({estados:[expected]})});
    assert.equal(p.status,200);
    const poll=await fetch(base+'/d/sinaleiro-bancada',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({digestor_id:1})});
    const payload=await poll.json();assert.equal(poll.status,200);assert.equal(payload.modo,'SIMULACAO');assert.equal(payload.comando_habilitado,false);
    assert.equal(payload.sinaleiro_bancada.origem,'SIMULACAO');assert.equal(payload.sinaleiro_bancada.temperatura_c,expected.temperatura_c);assert.equal(payload.sinaleiro_bancada.cor_sinaleiro,expected.cor_sinaleiro);
    assert.equal(payload.sinaleiro_bancada.estado_simulacao_disponivel,true);
    for (const [key,value] of Object.entries(expected)) {
      if (key==='versao_fase') assert.ok(Number.isInteger(payload.sinaleiro_bancada[key]) && payload.sinaleiro_bancada[key]>=1);
      else if (key==='validade_ms') assert.ok(payload.sinaleiro_bancada[key]>0 && payload.sinaleiro_bancada[key]<=6500);
      else assert.deepEqual(payload.sinaleiro_bancada[key],value,'contrato do parser ESP32: '+key);
    }
    // Firmware envia defaults fechados para um pacote legado sem componentes do PC.
    const telemetry={...payload.sinaleiro_bancada,fonte_simulacao:'CAD',fase_recebida:payload.sinaleiro_bancada.fase,fase_aplicada:payload.sinaleiro_bancada.fase,sensor_tipo:'SIMULADO',sensor_status:'SIMULADO',estado_simulacao_disponivel:false,aquecimento_simulado:false,purgadores_simulados:{camisa:'FECHADO',eixo:'FECHADO'}};
    const report=await fetch(base+'/d/estado',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(telemetry)});
    assert.equal(report.status,200);
    const supervision=await (await fetch(base+'/automacao/api/digestores/status')).json();
    const current=supervision.digestores.find(d=>d.digestor_id===1);
    assert.equal(current.simulacao_atual,true);assert.equal(current.sensor_status,'SIMULADO');assert.equal(current.temperatura_c,expected.temperatura_c);
    assert.equal(current.estado_simulacao_disponivel,false);assert.equal(current.aquecimento_simulado,false);assert.deepEqual(current.purgadores_simulados,{camisa:'FECHADO',eixo:'FECHADO'});
  } finally {server.close();}
});
