const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');

const read=rel=>fs.readFileSync(path.join(__dirname,'..',rel),'utf8');

test('reposicao de lubrificantes migra cadastro sem mudar o estoque fisico',()=>{
  const db=new Database(':memory:');
  try {
    db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT); CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY,tipo_origem TEXT); CREATE TABLE pcm_lubrificacao_execucoes(id INTEGER PRIMARY KEY);");
    require('../database/migrations/227_lubrificacao_reposicao_inteligente.js')({db});
    const values=db.prepare('SELECT codigo,saldo_referencia,minimo,alvo,embalagem_quantidade,especificacao_confirmada FROM pcm_lub_reposicao_itens').all();
    assert.equal(values.length,4);
    const m=new Map(values.map(x=>[x.codigo,x]));
    assert.deepEqual([m.get('OLEO_680').saldo_referencia,m.get('OLEO_680').minimo,m.get('OLEO_680').alvo],[4,2,4]);
    assert.deepEqual([m.get('GRAXA_EP2').saldo_referencia,m.get('GRAXA_EP2').minimo,m.get('GRAXA_EP2').embalagem_quantidade],[20,5,20]);
    assert.equal(m.get('GRAXA_DECANTER_JULIANO').embalagem_quantidade,1);
    assert.equal(m.get('GRAXA_DECANTER_GRATT').especificacao_confirmada,0);
    require('../database/migrations/227_lubrificacao_reposicao_inteligente.js')({db});
    assert.equal(db.prepare('SELECT COUNT(*) n FROM pcm_lub_reposicao_itens').get().n,4);
  } finally { db.close(); }
});

test('roteiro debita EP2 uma vez por equipamento/dia; pre-solicitacao revisavel e idempotente',()=>{
  const db=new Database(':memory:');
  const dbKey=require.resolve('../database/db');
  const soKey=require.resolve('../modules/solicitacoes/solicitacoes.service');
  const serviceKey=require.resolve('../modules/lubrificacao/lubrificacao-reposicao.service');
  const prevDb=require.cache[dbKey], prevSo=require.cache[soKey],prevService=require.cache[serviceKey];
  try {
    db.pragma('foreign_keys=ON');
    db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT); INSERT INTO users VALUES(1,'ADMIN'); CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY,tipo_origem TEXT); CREATE TABLE pcm_lubrificacao_execucoes(id INTEGER PRIMARY KEY);");
    require('../database/migrations/227_lubrificacao_reposicao_inteligente.js')({db});
    const submits=[];
    require.cache[dbKey]={id:dbKey,filename:dbKey,loaded:true,exports:db};
    require.cache[soKey]={id:soKey,filename:soKey,loaded:true,exports:{
      createSolicitacao(payload){submits.push(payload);return Number(db.prepare("INSERT INTO solicitacoes(tipo_origem) VALUES('SOLICITACAO')").run().lastInsertRowid);},
      finalizarElaboracao(id,userId){submits.push({finalizado:id,uid:userId});}
    }};
    delete require.cache[serviceKey];
    const service=require(serviceKey);
    assert.equal(service.classificar({tipo_lubrificante_texto:'Graxa especial' },'Decanter FAST'),null);
    assert.equal(service.classificar({tipo_lubrificante_texto:'Graxa especial' },'Decanter Juliano'),'GRAXA_DECANTER_JULIANO');
    assert.equal(service.classificar({tipo_lubrificante_texto:'Graxa' },'Decanter GRATT'),'GRAXA_DECANTER_GRATT');
    assert.equal(service.classificar({tipo_lubrificante_texto:'Graxa EP2' },'Prensa P50'),'GRAXA_EP2');
    assert.equal(service.classificar({tipo_lubrificante_texto:'Óleo 680' },'Redutor'),'OLEO_680');
    const exec=db.prepare('INSERT INTO pcm_lubrificacao_execucoes(id) VALUES(?)');
    const plano={tipo_lubrificante_texto:'Graxa EP2',unidade:'G',equipamento_id:11};
    exec.run(1);
    const single=service.registrarConsumo(1,plano,150,'Prensa P50');
    assert.equal(single.quantidade,0.15);
    exec.run(2);
    assert.equal(service.registrarConsumo(2,plano,150,'Prensa P50'),null);
    const oil={tipo_lubrificante_texto:'Óleo ISO VG 680',ponto_lubrificacao:'Verificar nível do redutor',unidade:'TAMBOR',equipamento_id:19};
    exec.run(3);
    assert.equal(service.registrarConsumo(3,oil,1,'Redutor'),null);
    for(let i=4;i<=103;i++){exec.run(i);service.registrarConsumo(i,{...plano,equipamento_id:i},150,'Prensa');}
    const before=service.getPainel();
    const ep=before.itens.find(x=>x.codigo==='GRAXA_EP2');
    assert.ok(ep.saldo<=5);
    assert.equal(ep.quantidade_sugerida,1);
    assert.equal(ep.sugestao.status,'SUGERIDA');
    const first=service.enviarSugestao(ep.sugestao.id,{id:1},{quantidade_embalagens:'2'});
    assert.equal(first.id,1);
    assert.equal(service.enviarSugestao(ep.sugestao.id,{id:1}).ja_enviada,true);
    assert.equal(submits.filter(x=>x.itens).length,1);
    assert.equal(submits[0].itens[0].qtd_solicitada,2);
    assert.equal(db.prepare('SELECT tipo_origem FROM solicitacoes WHERE id=1').get().tipo_origem,'LUBRIFICACAO');
    assert.equal(service.getPainel().itens.find(x=>x.codigo==='GRAXA_EP2').sugestao.status,'ENVIADA');
    assert.throws(()=>service.salvarConfiguracao('GRAXA_DECANTER_GRATT',{minimo:0.25,alvo:1,embalagem_quantidade:1,consumo_padrao:0,modo:'AUTOMATICO',especificacao_confirmada:'0'},{id:1}),/Valide a especificação/);
    assert.equal(service.contarAlertas()>=2,true);
  } finally {
    delete require.cache[serviceKey];
    if(prevService)require.cache[serviceKey]=prevService;
    if(prevSo)require.cache[soKey]=prevSo; else delete require.cache[soKey];
    if(prevDb)require.cache[dbKey]=prevDb; else delete require.cache[dbKey];
    db.close();
  }
});

test('PCM gerencia sugestoes sem OS e alertas aparecem so ao administrador',()=>{
  const routes=read('modules/pcm/pcm.routes.js');
  const ctrl=read('modules/pcm/pcm.controller.js');
  const layout=read('views/layout.ejs');
  const roteiro=read('modules/lubrificacao/lubrificacao.service.js');
  assert.match(routes,/requireRole\(PCM_MANAGE\),ctrl\.enviarSugestaoReposicaoLubrificacao/);
  assert.match(ctrl,/reposicaoLubrificacao\.getPainel\(\)/);
  assert.match(layout,/user && isAdmin && Number\(lubrificacaoAlertasCount/);
  assert.match(roteiro,/reposicaoService\.registrarConsumo/);
  assert.match(roteiro,/reposicaoService\.enviarAutomaticas/);
  assert.match(read('views/pcm/lubrificacao.ejs'),/Reposição de óleos e graxas/);
  assert.doesNotMatch(read('modules/lubrificacao/lubrificacao-reposicao.service.js'),/osService\.createOS/);
});
