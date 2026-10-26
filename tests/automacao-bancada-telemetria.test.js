const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
let db;
try {db=new (require('better-sqlite3'))(':memory:');}catch{db=new (require('node:sqlite').DatabaseSync)(':memory:');}
require.cache[require.resolve('../database/db')]={exports:db};
for (const m of ['229_automacao_dispositivos','230_automacao_dispositivo_estados','231_automacao_sinaleiros_bancada','232_automacao_bancada_telemetria','233_automacao_bancada_correlacao','235_automacao_temperatura_real','236_automacao_sensor_simulado']) require('../database/migrations/'+m+'.js')();
const devices=require('../modules/automacao/dispositivos.service');
const bancada=require('../modules/automacao/sinaleiro-bancada.service');
const tel=require('../modules/automacao/bancada-telemetria.service');
after(()=>db.close());

async function withApp(fn){
  const app=express();app.use(express.json());
  app.use('/d',require('../modules/automacao/dispositivos.routes'));
  const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port+'/d';
  try{await fn((path,token,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body||{})}));}
  finally{server.close();}
}
const d1=()=>tel.status().digestores[0];

test('token invalido, ausente e de outro digestor são rejeitados em ping, estado e sinaleiro',async()=>{
  const t1=devices.issueToken('ESP32-DIGESTOR-01',1,1).token;
  await withApp(async(post)=>{
    for (const p of ['/ping','/estado','/sinaleiro-bancada']) {
      assert.equal((await post(p,null,{})).status,401);
      assert.equal((await post(p,'cgd_token_invalido_000000000',{})).status,401);
    }
    assert.equal((await post('/estado',t1,{fase:'INICIO',digestor_id:2})).status,403);
    assert.equal((await post('/estado',t1,{fase:'INICIO',device_id:'ESP32-DIGESTOR-02'})).status,403);
    assert.equal((await post('/sinaleiro-bancada',t1,{digestor_id:2})).status,403);
  });
});

test('telemetria distingue solicitada, entregue, recebida, aplicada e saida; PARADO é aceito',async()=>{
  const token=devices.issueToken('ESP32-DIGESTOR-01',1,1).token;
  bancada.publish([{digestor_id:1,fase:'MEIO'}],1);
  await withApp(async(post)=>{
    let r=await (await post('/sinaleiro-bancada',token,{digestor_id:1})).json();
    assert.equal(r.sinaleiro_bancada.fase,'MEIO');
    let s=d1();
    assert.equal(s.fase_solicitada,'MEIO'); assert.equal(s.fase_entregue,'MEIO');
    assert.equal(s.fase_recebida,null); assert.equal(s.saida_confirmada,null);
    assert.equal(s.conexao,'ONLINE'); assert.equal(s.aplicacao_status,'PENDENTE'); // comando enviado não é confirmação
    // Retrocompatível: payload antigo continua válido
    assert.equal((await post('/estado',token,{fase:'MEIO'})).status,200);
    r=await post('/estado',token,{fase:'MEIO',fase_recebida:'MEIO',fase_aplicada:'MEIO',origem:'SIMULACAO',wifi_rssi:-60,firmware:'v5'});
    assert.equal(r.status,200);
    s=d1(); assert.equal(s.fase_aplicada,'MEIO'); assert.equal(s.saida_confirmada,null); assert.equal(s.conexao,'ONLINE');
    assert.equal((await post('/estado',token,{fase:'MEIO',fase_aplicada:'MEIO',saida_confirmada:true})).status,200);
    assert.equal(d1().saida_confirmada,true); assert.equal(d1().saida_status,'CONFIRMADA');
    // PARADO após expiração
    assert.equal((await post('/estado',token,{fase:'PARADO',fase_recebida:'PARADO',fase_aplicada:'PARADO'})).status,200);
    assert.equal(d1().fase_aplicada,'PARADO');
  });
});

test('validações: origem, fase, saida_confirmada sem fase aplicada',async()=>{
  const token=devices.issueToken('ESP32-DIGESTOR-01',1,1).token;
  await withApp(async(post)=>{
    assert.equal((await post('/estado',token,{fase:'ABRIR_VALVULA'})).status,400);
    assert.equal((await post('/estado',token,{fase:'MEIO',origem:'PRODUCAO'})).status,400);
    assert.equal((await post('/estado',token,{fase:'MEIO',origem:'REAL',fase_aplicada:'MEIO'})).status,400);
    assert.equal(d1().origem,'SIMULACAO'); // protótipo nunca vira medição real
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM automacao_bancada_telemetria').get().n,0); // rejeição é atômica
    assert.equal((await post('/estado',token,{fase:'MEIO',fase_aplicada:'VAPOR'})).status,400);
    assert.equal((await post('/estado',token,{fase:'MEIO',saida_confirmada:true})).status,400);
    assert.equal((await post('/estado',token,{fase:'MEIO',fase_aplicada:'MEIO',saida_confirmada:'sim'})).status,400);
  });
});

test('simulação legada sem origem REAL não aceita temperatura como leitura de processo',async()=>{
  const token=devices.issueToken('ESP32-DIGESTOR-01',1,1).token;
  await withApp(async(post)=>{
    const r=await post('/estado',token,{fase:'INICIO',temperatura_c:95.5,sensor_tipo:'PT100',sensor_status:'VALIDO',timestamp_medicao:new Date().toISOString()});
    assert.equal(r.status,200);
  });
  const row=db.prepare('SELECT * FROM automacao_bancada_telemetria').get();
  assert.equal(row.temperatura_c,null); assert.equal(row.sensor_status,'SEM_SENSOR'); assert.equal(row.sensor_tipo,null);
  assert.equal(JSON.parse(db.prepare('SELECT last_payload FROM automacao_dispositivos').get().last_payload).temperatura_c,null);
  assert.equal(d1().temperatura_c,null); assert.equal(d1().pt100_habilitado,false);
});

test('expiração, perda de Wi-Fi e reinício: sinal vence e estado de conexão degrada',async()=>{
  const dev=devices.authenticate(devices.issueToken('ESP32-DIGESTOR-01',1,1).token);
  bancada.publish([{digestor_id:1,fase:'FINAL'}],1);
  assert.equal(bancada.poll(dev,1).fase,'FINAL');
  assert.ok(bancada.poll(dev,1).validade_ms<=6500);
  // reinício do servidor: nenhum estado em memória; recarregar módulos mantém o sinal enquanto válido
  for (const k of Object.keys(require.cache)) if (/modules\/automacao\//.test(k)) delete require.cache[k];
  const b2=require('../modules/automacao/sinaleiro-bancada.service');
  assert.equal(b2.poll(dev,1).fase,'FINAL');
  // vence: PARADO
  db.prepare('UPDATE automacao_sinaleiros_bancada SET valid_until_ms=? WHERE digestor_id=1').run(Date.now()-1);
  assert.equal(b2.poll(dev,1).fase,'PARADO');
  // perda de Wi-Fi: contato antigo => ATRASADO / OFFLINE
  const t2=require('../modules/automacao/bancada-telemetria.service');
  db.prepare("UPDATE automacao_bancada_telemetria SET last_poll_at=datetime('now','-40 seconds'),reported_at=datetime('now','-40 seconds')").run();
  assert.equal(t2.status().digestores[0].conexao,'ATRASADO');
  db.prepare("UPDATE automacao_bancada_telemetria SET last_poll_at=datetime('now','-300 seconds'),reported_at=datetime('now','-300 seconds')").run();
  assert.equal(t2.status().digestores[0].conexao,'OFFLINE');
  assert.equal(t2.status().digestores[1].conexao,'SEM_DISPOSITIVO');
});

test('token geral informa digestor; quatro digestores são independentes',async()=>{
  const token=devices.issueToken('ESP32-GERAL-01',1,'TODOS').token;
  await withApp(async(post)=>{
    assert.equal((await post('/estado',token,{fase:'INICIO'})).status,400);
    assert.equal((await post('/estado',token,{fase:'INICIO',digestor_id:3,fase_aplicada:'INICIO'})).status,200);
  });
  const s=tel.status().digestores;
  assert.equal(s[2].fase_aplicada,'INICIO'); assert.equal(s[0].fase_aplicada,null);
});

test('status da bancada acessível a supervisor e ADMIN, não aos demais perfis',async()=>{
  const app=express();app.use(express.json());
  let role='MANUTENCAO_SUPERVISOR';
  app.use((req,_res,next)=>{req.session={user:{id:1,role}};req.flash=()=>{};next()});
  app.use('/automacao',require('../modules/automacao/automacao.routes'));
  const server=app.listen(0);const url='http://127.0.0.1:'+server.address().port+'/automacao/api/simulador/sinaleiros/status';
  try{
    assert.equal((await fetch(url,{redirect:'manual'})).status,200);
    role='COMPRAS';
    assert.equal((await fetch(url,{redirect:'manual'})).status,403);
    role='ADMIN';
    const r=await fetch(url);assert.equal(r.status,200);
    const b=await r.json();assert.equal(b.digestores.length,4);assert.equal(b.comando_industrial_habilitado,false);
  }finally{server.close();}
});

// ---- Precisão da supervisão: confirmação ausente/antiga, PARADO, offline ----
const reset=()=>{db.exec('DELETE FROM automacao_bancada_telemetria; DELETE FROM automacao_sinaleiros_bancada;');};
const tok=()=>devices.issueToken('ESP32-DIGESTOR-01',1,1).token;

test('fase_recebida sem fase_aplicada: recebida confirmada, aplicação NÃO informada, saída não informada',async()=>{
  reset();const token=tok();
  bancada.publish([{digestor_id:1,fase:'INICIO'}],1);
  await withApp(async(post)=>{
    await post('/sinaleiro-bancada',token,{digestor_id:1});
    await post('/estado',token,{fase:'INICIO',fase_recebida:'INICIO'});
    const s=d1();
    assert.equal(s.recebida_status,'CONFIRMADA'); assert.equal(s.aplicacao_status,'NAO_INFORMADA');
    assert.equal(s.saida_status,'NAO_INFORMADA'); assert.equal(s.saida_confirmada,null);
    assert.equal(s.fase_aplicada,null); assert.equal(s.conexao,'ONLINE');
  });
});

test('v6: aplicada sem feedback elétrico não confirma saída física',async()=>{
  reset();const token=tok();
  bancada.publish([{digestor_id:1,fase:'MEIO'}],1);
  await withApp(async(post)=>{
    const p=await (await post('/sinaleiro-bancada',token,{digestor_id:1})).json();
    assert.equal(p.sinaleiro_bancada.versao_fase,1);
    await post('/estado',token,{fase:'MEIO',fase_recebida:'MEIO',fase_aplicada:'MEIO',versao_fase:1,firmware:'bancada-v6',wifi_rssi:-55,uptime_s:10});
    const s=d1();
    assert.equal(s.correlacao,'VERSAO'); assert.equal(s.aplicacao_status,'CONFIRMADA');
    assert.equal(s.saida_status,'NAO_INFORMADA'); assert.equal(s.saida_confirmada,null); assert.equal(s.origem,'SIMULACAO');
  });
});

test('relatório antigo dentro de 15 s não confirma novo comando (versão e firmware legado)',async()=>{
  reset();const token=tok();
  bancada.publish([{digestor_id:1,fase:'MEIO'}],1);
  await withApp(async(post)=>{
    await post('/sinaleiro-bancada',token,{digestor_id:1});
    await post('/estado',token,{fase:'MEIO',fase_recebida:'MEIO',fase_aplicada:'MEIO',versao_fase:1});
    assert.equal(d1().aplicacao_status,'CONFIRMADA');
    // renovação da mesma fase ainda válida mantém a versão 1 (confirmação segue válida)
    bancada.publish([{digestor_id:1,fase:'MEIO'}],1);
    assert.equal(d1().versao_fase,1); assert.equal(d1().aplicacao_status,'CONFIRMADA');
    // novo ciclo MEIO -> MEIO após expiração: versão 2, relatório v1 é antigo
    db.prepare('UPDATE automacao_sinaleiros_bancada SET valid_until_ms=1 WHERE digestor_id=1').run();
    bancada.publish([{digestor_id:1,fase:'MEIO'}],1);
    let s=d1(); assert.equal(s.versao_fase,2);
    assert.equal(s.aplicacao_status,'PENDENTE'); assert.equal(s.recebida_status,'PENDENTE'); assert.equal(s.fase_aplicada,null);
    await post('/sinaleiro-bancada',token,{digestor_id:1});
    assert.equal(d1().aplicacao_status,'PENDENTE');
    // firmware v6 reenviando versão antiga continua pendente
    await post('/estado',token,{fase:'MEIO',fase_aplicada:'MEIO',fase_recebida:'MEIO',versao_fase:1});
    assert.equal(d1().aplicacao_status,'PENDENTE');
    await post('/estado',token,{fase:'MEIO',fase_aplicada:'MEIO',fase_recebida:'MEIO',versao_fase:2});
    assert.equal(d1().aplicacao_status,'CONFIRMADA');
  });
  // legado (sem versao_fase): relatório anterior à entrega do novo comando não vale
  reset();
  bancada.publish([{digestor_id:1,fase:'FINAL'}],1);
  await withApp(async(post)=>{
    await post('/estado',token,{fase:'FINAL',fase_recebida:'FINAL',fase_aplicada:'FINAL'}); // antes da entrega
    assert.equal(d1().aplicacao_status,'PENDENTE');
    await new Promise((r)=>setTimeout(r,5));
    await post('/sinaleiro-bancada',token,{digestor_id:1});
    assert.equal(d1().aplicacao_status,'PENDENTE'); // relatório ainda é anterior à entrega
    await new Promise((r)=>setTimeout(r,5));
    await post('/estado',token,{fase:'FINAL',fase_recebida:'FINAL',fase_aplicada:'FINAL'});
    const s=d1(); assert.equal(s.aplicacao_status,'CONFIRMADA'); assert.equal(s.correlacao,'TEMPORAL');
  });
});

test('comando expirado não aparece como aplicação atual confirmada',async()=>{
  reset();const token=tok();
  bancada.publish([{digestor_id:1,fase:'INICIO'}],1);
  await withApp(async(post)=>{
    await post('/sinaleiro-bancada',token,{digestor_id:1});
    await post('/estado',token,{fase:'INICIO',fase_recebida:'INICIO',fase_aplicada:'INICIO',versao_fase:1});
    assert.equal(d1().aplicacao_status,'CONFIRMADA');
    db.prepare('UPDATE automacao_sinaleiros_bancada SET valid_until_ms=? WHERE digestor_id=1').run(Date.now()+1-1);
    await new Promise((r)=>setTimeout(r,3));
    const s=d1();
    assert.equal(s.comando_expirado,true); assert.equal(s.fase_solicitada,'PARADO');
    assert.equal(s.aplicacao_status,'PENDENTE'); assert.equal(s.fase_aplicada,null); assert.equal(s.saida_confirmada,null);
    // só um relatório posterior ao vencimento, informando PARADO, confirma
    await post('/estado',token,{fase:'PARADO',fase_recebida:'PARADO',fase_aplicada:'PARADO',versao_fase:1});
    const f=d1(); assert.equal(f.aplicacao_status,'CONFIRMADA'); assert.equal(f.fase_aplicada,'PARADO');
  });
});

test('fase PARADO explícita: exige relatório PARADO posterior; INICIO antigo não confirma',async()=>{
  reset();const token=tok();
  bancada.publish([{digestor_id:1,fase:'INICIO'}],1);
  await withApp(async(post)=>{
    await post('/sinaleiro-bancada',token,{digestor_id:1});
    await post('/estado',token,{fase:'INICIO',fase_recebida:'INICIO',fase_aplicada:'INICIO',versao_fase:1});
    await new Promise((r)=>setTimeout(r,5));
    bancada.publish([{digestor_id:1,fase:'PARADO'}],1);
    let s=d1(); assert.equal(s.fase_solicitada,'PARADO'); assert.equal(s.aplicacao_status,'PENDENTE'); assert.equal(s.fase_aplicada,null);
    await new Promise((r)=>setTimeout(r,5));
    await post('/estado',token,{fase:'INICIO',fase_recebida:'INICIO',fase_aplicada:'INICIO'});
    assert.equal(d1().aplicacao_status,'DIVERGENTE');
    await post('/estado',token,{fase:'PARADO',fase_recebida:'PARADO',fase_aplicada:'PARADO'});
    assert.equal(d1().aplicacao_status,'CONFIRMADA'); assert.equal(d1().conexao,'ONLINE');
  });
});

test('dispositivo offline/atrasado: nada é confirmado mesmo com relatório correlacionado',async()=>{
  reset();const token=tok();
  bancada.publish([{digestor_id:1,fase:'MEIO'}],1);
  await withApp(async(post)=>{
    await post('/sinaleiro-bancada',token,{digestor_id:1});
    await post('/estado',token,{fase:'MEIO',fase_recebida:'MEIO',fase_aplicada:'MEIO',versao_fase:1,saida_confirmada:true});
    assert.equal(d1().saida_status,'CONFIRMADA');
    db.prepare("UPDATE automacao_bancada_telemetria SET last_poll_at=datetime('now','-40 seconds'),reported_at=datetime('now','-40 seconds'),reported_ms=reported_ms-40000").run();
    db.prepare("UPDATE automacao_dispositivos SET last_seen_at=datetime('now','-40 seconds')").run();
    let s=d1(); assert.equal(s.conexao,'ATRASADO'); assert.equal(s.aplicacao_status,'PENDENTE'); assert.equal(s.saida_confirmada,null);
    db.prepare("UPDATE automacao_bancada_telemetria SET last_poll_at=datetime('now','-300 seconds'),reported_at=datetime('now','-300 seconds'),reported_ms=reported_ms-260000").run();
    db.prepare("UPDATE automacao_dispositivos SET last_seen_at=datetime('now','-300 seconds')").run();
    s=d1(); assert.equal(s.conexao,'OFFLINE'); assert.equal(s.recebida_status,'PENDENTE'); assert.equal(s.aplicacao_status,'PENDENTE'); assert.equal(s.fase_aplicada,null);
  });
});

test('migration 233 é aditiva e idempotente (preserva dados anteriores)',()=>{
  reset();
  db.prepare("INSERT INTO automacao_sinaleiros_bancada (digestor_id,fase,valid_until_ms) VALUES (2,'MEIO',1)").run();
  require('../database/migrations/233_automacao_bancada_correlacao.js')();
  assert.equal(db.prepare('SELECT fase FROM automacao_sinaleiros_bancada WHERE digestor_id=2').get().fase,'MEIO');
});
