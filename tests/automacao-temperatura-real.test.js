const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
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
const reading = (t=120.1) => ({ origem:'REAL',sensor_tipo:'PT100',sensor_status:'VALIDO',temperatura_c:t,timestamp_medicao:new Date().toISOString(),...classifyTemperature(t) });
const status = () => tel.status().digestores[0];

test('quatro faixas contínuas preservam limites e decimais; simulação publica decisão explícita',()=>{
  const d=dev();
  for (const [t,cor] of [[0,'VERDE'],[50,'VERDE'],[50.1,'AMARELO'],[51,'AMARELO'],[99.99,'AMARELO'],[100,'VERMELHO'],[120,'VERMELHO'],[120.01,'VERMELHO_PISCANDO']]) {
    bancada.publish([{digestor_id:1,fase:'MEIO',temperatura_c:t}],1);
    const s=bancada.poll(d,1);
    assert.equal(s.cor_sinaleiro,cor);assert.equal(s.temperatura_c,t);assert.equal(s.pronto_descarga,t>120);
    assert.equal(s.origem,'SIMULACAO');assert.equal(s.processo_habilitado,false);
  }
  for (const t of [null,'120',true,NaN,Infinity,-1,851]) assert.equal(classifyTemperature(t),null);
  bancada.publish([{digestor_id:1,fase:'PARADO',temperatura_c:130}],1);
  assert.equal(bancada.poll(d,1).cor_sinaleiro,'DESLIGADO');
});

test('REAL persiste e espelha pacote do ESP32 sem depender de comando ou versão CAD',()=>{
  const d=dev();
  devices.recordContact(d,reading());
  let s=status();
  assert.equal(s.origem,'REAL');assert.equal(s.temperatura_c,120.1);assert.equal(s.cor_sinaleiro,'VERMELHO_PISCANDO');
  assert.equal(s.faixa_temperatura,'PRONTO');assert.equal(s.pronto_descarga,true);assert.equal(s.medicao_atual,true);
  assert.equal(s.saida_confirmada,null); // GPIO aplicado não equivale a feedback elétrico
  const row=db.prepare('SELECT * FROM automacao_bancada_telemetria WHERE device_pk=?').get(d.id);
  assert.equal(row.temperatura_c,120.1);assert.equal(row.origem,'REAL');
  assert.equal(JSON.parse(db.prepare('SELECT last_payload FROM automacao_dispositivos WHERE id=?').get(d.id).last_payload).origem,'REAL');
  assert.equal(devices.listDevices().find(x=>x.device_id===d.device_id).sinaleiro.piscando,true);
  bancada.publish([{digestor_id:1,fase:'INICIO',temperatura_c:20}],1);
  s=status();assert.equal(s.cor_sinaleiro,'VERMELHO_PISCANDO'); // comando simulado não altera decisão REAL
});

test('sensor em falha cancela pronto e não inventa temperatura; telemetria antiga não parece atual',()=>{
  const d=dev();devices.recordContact(d,reading());
  devices.recordContact(d,{origem:'REAL',sensor_tipo:'PT100',sensor_status:'FALHA',temperatura_c:null,timestamp_medicao:null,faixa_temperatura:'SENSOR_INDISPONIVEL',cor_sinaleiro:'DESLIGADO',pronto_descarga:false});
  let s=status();assert.equal(s.temperatura_c,null);assert.equal(s.pronto_descarga,false);assert.equal(s.cor_sinaleiro,'DESLIGADO');assert.equal(s.sensor_status,'FALHA');
  devices.recordContact(d,reading());
  db.prepare("UPDATE automacao_bancada_telemetria SET reported_at=datetime('now','-30 seconds') WHERE device_pk=?").run(d.id);
  devices.recordPing(d); // ping recente não revalida medição
  s=status();assert.equal(s.telemetria_atual,false);assert.equal(s.medicao_atual,false);assert.equal(s.temperatura_c,null);assert.equal(s.cor_sinaleiro,null);assert.equal(s.pronto_descarga,false);
});

test('REAL incompleto, inconsistente, temperatura inválida e timestamp antigo/futuro são rejeitados atomicamente',()=>{
  const d=dev();
  const bads=[{origem:'REAL'}, {...reading(),temperatura_c:'120.1'}, {...reading(),temperatura_c:true}, {...reading(),temperatura_c:null}, {...reading(),temperatura_c:-1}, {...reading(),cor_sinaleiro:'VERDE'}, {...reading(),pronto_descarga:false}, {...reading(),timestamp_medicao:new Date(Date.now()-60000).toISOString()}, {...reading(),timestamp_medicao:new Date(Date.now()+60000).toISOString()}, {...reading(),sensor_status:'FALHA'}];
  for (const b of bads) assert.throws(()=>devices.recordContact(d,b),e=>e.status===400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM automacao_bancada_telemetria WHERE device_pk=?').get(d.id).n,0);
  assert.equal(db.prepare('SELECT last_seen_at FROM automacao_dispositivos WHERE id=?').get(d.id).last_seen_at,null);
});

test('poll de outro token no mesmo digestor não oculta relatório REAL; histórico SIM não vira estado REAL',()=>{
  const d=dev();devices.recordContact(d,{fase:'FINAL'});devices.recordContact(d,reading());
  const other=devices.authenticate(devices.issueToken('ESP32-OUTRO-01',1,1).token);
  bancada.poll(other,1);
  assert.equal(status().origem,'REAL');assert.equal(status().pronto_descarga,true);
  assert.deepEqual(devices.listDevices().find(x=>x.device_id===d.device_id).estados,[]);
  db.prepare("UPDATE automacao_bancada_telemetria SET reported_at=datetime('now','-300 seconds'),last_poll_at=NULL WHERE device_pk=?").run(d.id);
  db.prepare("UPDATE automacao_dispositivos SET last_seen_at=datetime('now','-300 seconds') WHERE id=?").run(d.id);
  devices.recordPing(other);
  assert.equal(status().comunicacao,'OFFLINE');
});

test('leitura atrasada não restaura PRONTO após leitura mais recente ou falha',()=>{
  const d=dev();
  devices.recordContact(d,reading(100));
  const older={...reading(125),timestamp_medicao:new Date(Date.now()-1000).toISOString()};
  assert.throws(()=>devices.recordContact(d,older),/anterior/);
  assert.equal(status().cor_sinaleiro,'VERMELHO');assert.equal(status().pronto_descarga,false);
  assert.ok(status().medicao_idade_s>=0);
});

test('migration 235 é aditiva e idempotente',()=>{
  const before=db.prepare('SELECT COUNT(*) n FROM automacao_dispositivos').get().n;
  require('../database/migrations/235_automacao_temperatura_real')();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM automacao_dispositivos').get().n,before);
});

test('API REAL funciona com token no escopo e supervisão usa RBAC existente sem permitir comandos',async()=>{
  const token=devices.issueToken('ESP32-DIGESTOR-01',1,1).token;
  let role='MANUTENCAO_SUPERVISOR';
  const app=express();app.use(express.json());app.use('/d',require('../modules/automacao/dispositivos.routes'));
  app.use((req,_res,next)=>{req.session={user:{id:1,role}};req.flash=()=>{};next();});app.use('/automacao',require('../modules/automacao/automacao.routes'));
  const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port;
  try {
    const post=(body)=>fetch(base+'/d/estado',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
    const r=await post(reading());assert.equal(r.status,200);assert.equal((await r.json()).modo,'REAL');
    assert.equal((await post({...reading(),digestor_id:2})).status,403);
    const s=await fetch(base+'/automacao/api/digestores/status',{headers:{Accept:'application/json'}});assert.equal(s.status,200);assert.equal((await s.json()).comando_industrial_habilitado,false);
    const supervisorBancada=await fetch(base+'/automacao/api/simulador/sinaleiros/status');
    assert.equal(supervisorBancada.status,200);
    assert.equal((await supervisorBancada.json()).comando_industrial_habilitado,false);
    role='COMPRAS';assert.equal((await fetch(base+'/automacao/api/digestores/status',{headers:{Accept:'application/json'}})).status,403);
  } finally {server.close();}
});
