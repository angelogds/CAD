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


test('PCM usa estoque fisico: sem vinculo nao ha saldo ficticio, sem quantidade nao ha baixa e compras nao duplicam',()=>{
  const db=new Database(':memory:');
  const dbKey=require.resolve('../database/db');
  const soKey=require.resolve('../modules/solicitacoes/solicitacoes.service');
  const stockKey=require.resolve('../modules/estoque/estoque.service');
  const serviceKey=require.resolve('../modules/lubrificacao/lubrificacao-reposicao.service');
  const previous=[dbKey,soKey,stockKey,serviceKey].map(key=>[key,require.cache[key]]);
  try {
    db.pragma('foreign_keys=ON');
    db.exec(`
      CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT);
      INSERT INTO users VALUES(1,'ADMIN');
      CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY,tipo_origem TEXT,status TEXT DEFAULT 'ABERTA',pre_status TEXT,numero TEXT);
      CREATE TABLE pcm_lubrificacao_execucoes(id INTEGER PRIMARY KEY);
      CREATE TABLE estoque_locais(id INTEGER PRIMARY KEY,nome TEXT);
      INSERT INTO estoque_locais VALUES(1,'Oficina'),(2,'Almoxarifado');
      CREATE TABLE estoque_categorias(id INTEGER PRIMARY KEY,nome TEXT);
      INSERT INTO estoque_categorias VALUES(1,'LUBRIFICANTES');
      CREATE TABLE estoque_itens(id INTEGER PRIMARY KEY,codigo TEXT,nome TEXT,unidade TEXT,saldo_atual REAL,saldo_minimo REAL,ponto_reposicao REAL,saldo_alvo REAL,ativo INTEGER,setor_utilizacao TEXT,local_id INTEGER,categoria_id INTEGER,updated_at TEXT);
      INSERT INTO estoque_itens(id,codigo,nome,unidade,saldo_atual,ativo,setor_utilizacao,local_id,categoria_id) VALUES
        (10,'EP2','Graxa EP2','KG',20,1,'RECICLAGEM',1,1),
        (11,'O680','Óleo industrial VG 680','TAMBOR',4,1,'RECICLAGEM',2,1);
      CREATE TABLE estoque_movimentos(id INTEGER PRIMARY KEY,item_id INTEGER,quantidade REAL);
      CREATE TABLE estoque_reposicao_vinculos(estoque_item_id INTEGER,solicitacao_id INTEGER,PRIMARY KEY(estoque_item_id,solicitacao_id));
    `);
    require('../database/migrations/227_lubrificacao_reposicao_inteligente.js')({db});
    const addColumnIfMissing=(table,col,ddl)=>{
      if(!db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name===col)) db.exec('ALTER TABLE '+table+' ADD COLUMN '+ddl);
    };
    require('../database/migrations/238_pcm_lubrificacao_estoque_canonico.js')({db,addColumnIfMissing});
    const submits=[];
    require.cache[dbKey]={id:dbKey,filename:dbKey,loaded:true,exports:db};
    require.cache[soKey]={id:soKey,filename:soKey,loaded:true,exports:{
      createSolicitacao(payload){
        submits.push(payload);
        return Number(db.prepare("INSERT INTO solicitacoes(tipo_origem,status) VALUES('SOLICITACAO','ABERTA')").run().lastInsertRowid);
      },
      finalizarElaboracao(id,userId){submits.push({finalizado:id,uid:userId});}
    }};
    require.cache[stockKey]={id:stockKey,filename:stockKey,loaded:true,exports:{
      registrarSaidaLubrificacao({item_id,quantidade}){
        const item=db.prepare('SELECT saldo_atual FROM estoque_itens WHERE id=?').get(item_id);
        if(item.saldo_atual<quantidade) throw new Error('saldo insuficiente');
        db.prepare('UPDATE estoque_itens SET saldo_atual=saldo_atual-? WHERE id=?').run(quantidade,item_id);
        const movimentoId=Number(db.prepare('INSERT INTO estoque_movimentos(item_id,quantidade) VALUES(?,?)').run(item_id,quantidade).lastInsertRowid);
        return {movimentoId};
      }
    }};
    delete require.cache[serviceKey];
    const service=require(serviceKey);
    assert.equal(service.listarItens().find(i=>i.codigo==='GRAXA_EP2').saldo,null);
    assert.equal(service.getPainel().alertas,0);
    assert.equal(service.classificar({tipo_lubrificante_texto:'Óleo 680'},'Decanter Julian'),null);
    assert.equal(service.classificar({tipo_lubrificante_texto:'Óleo 680'},'Redutor'),'OLEO_680');
    assert.equal(service.classificar({tipo_lubrificante_texto:'Graxa especial'},'Decanter FAST'),null);
    const admin={id:1};
    const config=(id,minimo,alvo,embalagem)=>({
      estoque_item_id:id,minimo,alvo,embalagem_quantidade:embalagem,
      consumo_padrao:0,modo:'ASSISTIDO',especificacao_confirmada:'1'
    });
    service.salvarConfiguracao('GRAXA_EP2',config(10,5,20,20),admin);
    service.salvarConfiguracao('OLEO_680',config(11,2,4,1),admin);
    assert.equal(service.listarItens().find(i=>i.codigo==='GRAXA_EP2').saldo,20);
    assert.equal(service.listarOpcoesEstoque().length,2);
    const exec=db.prepare('INSERT INTO pcm_lubrificacao_execucoes(id) VALUES(?)');
    const grease={tipo_lubrificante_texto:'Graxa EP2',unidade:'G',equipamento_id:11};
    exec.run(1);
    assert.equal(service.registrarConsumo(1,grease,null,'Prensa',1),null);
    exec.run(2);
    assert.equal(service.registrarConsumo(2,grease,150,'Prensa',1).quantidade,0.15);
    assert.equal(service.registrarConsumo(2,grease,150,'Prensa',1),null);
    assert.ok(Math.abs(db.prepare('SELECT saldo_atual FROM estoque_itens WHERE id=10').get().saldo_atual-19.85)<0.0001);
    const inspection={tipo_lubrificante_texto:'Óleo ISO VG 680',ponto_lubrificacao:'Verificar nível do redutor',unidade:'TAMBOR',equipamento_id:19};
    exec.run(3);
    assert.equal(service.registrarConsumo(3,inspection,1,'Redutor',1),null);
    exec.run(4);
    assert.equal(service.registrarConsumo(4,{...inspection,ponto_lubrificacao:'Troca de óleo'},1,'Redutor',1).quantidade,1);
    assert.equal(db.prepare('SELECT saldo_atual FROM estoque_itens WHERE id=11').get().saldo_atual,3);
    for(let i=5;i<=20;i++){exec.run(i);service.registrarConsumo(i,{...grease,unidade:'KG',equipamento_id:11},1,'Prensa',1);}
    const ep=service.getPainel().itens.find(i=>i.codigo==='GRAXA_EP2');
    assert.equal(ep.abaixo_minimo,true);
    assert.equal(ep.quantidade_sugerida,1);
    assert.equal(ep.sugestao.status,'SUGERIDA');
    const first=service.enviarSugestao(ep.sugestao.id,admin);
    assert.equal(first.id,1);
    assert.equal(service.enviarSugestao(ep.sugestao.id,admin).ja_enviada,true);
    assert.equal(submits.filter(x=>x.itens).length,1);
    assert.equal(submits[0].itens[0].estoque_item_id,10);
    assert.equal(submits[0].itens[0].unidade,'KG');
    assert.equal(submits[0].itens[0].qtd_solicitada,20);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM estoque_reposicao_vinculos').get().n,1);
    assert.equal(service.getPainel().itens.find(i=>i.codigo==='GRAXA_EP2').sugestao.status,'ENVIADA');
    assert.throws(()=>service.ajustarSaldo('GRAXA_EP2',50,'conferencia',admin),/Almoxarifado/);
    assert.throws(()=>service.salvarConfiguracao('GRAXA_DECANTER_GRATT',{...config(null,.25,1,1),modo:'AUTOMATICO',especificacao_confirmada:'0'},admin),/Confirme especificação/);
  } finally {
    for(const [key,previousEntry] of previous) {
      delete require.cache[key];
      if(previousEntry) require.cache[key]=previousEntry;
    }
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
