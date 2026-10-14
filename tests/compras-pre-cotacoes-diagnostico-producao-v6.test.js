'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

test('diagnóstico mostra por que a pré-cotação ficou invisível, sem modificar banco',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cad-prequote-diagnostico-'));
  try {
    const result=execFileSync(process.execPath,['-e',"\nconst assert=require('node:assert/strict');\nconst db=require('./database/db');\ndb.exec([\n\"CREATE TABLE equipamentos(id INTEGER PRIMARY KEY,nome TEXT)\",\n\"CREATE TABLE demandas(id INTEGER PRIMARY KEY,titulo TEXT,status TEXT,prioridade TEXT,aprovacao_status TEXT,prazo_previsto TEXT,nr_referencia TEXT,equipamento_id INTEGER,setor_origem TEXT,liberacao_compras_status TEXT)\",\n\"CREATE TABLE os(id INTEGER PRIMARY KEY,demanda_id INTEGER)\",\n\"CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY,numero TEXT,titulo TEXT,status TEXT,prioridade TEXT,created_at TEXT,updated_at TEXT,demanda_id INTEGER,os_id INTEGER,setor_origem TEXT)\",\n\"CREATE TABLE solicitacao_itens(id INTEGER PRIMARY KEY,solicitacao_id INTEGER,status_cotacao TEXT,status_compra TEXT)\",\n\"INSERT INTO equipamentos VALUES(1,'Digestor 4')\",\n\"INSERT INTO demandas VALUES(10,'Demanda em planejamento','PLANEJAMENTO','ALTA','PENDENTE',NULL,NULL,1,'RECICLAGEM','PENDENTE')\",\n\"INSERT INTO demandas VALUES(20,'Demanda liberada','PLANEJAMENTO','MEDIA','PENDENTE',NULL,NULL,1,'RECICLAGEM','LIBERADA')\",\n\"INSERT INTO demandas VALUES(30,'Demanda Logística','PLANEJAMENTO','ALTA','PENDENTE',NULL,NULL,1,'LOGISTICA','PENDENTE')\",\n\"INSERT INTO os VALUES(100,NULL)\",\n\"INSERT INTO solicitacoes VALUES(11,'SOL-11','Materiais planejados','ABERTA','ALTA',datetime('now'),datetime('now'),10,NULL,'RECICLAGEM')\",\n\"INSERT INTO solicitacoes VALUES(12,'SOL-12','Materiais sem vínculo Demanda','ABERTA','ALTA',datetime('now'),datetime('now'),NULL,100,'RECICLAGEM')\",\n\"INSERT INTO solicitacoes VALUES(13,'SOL-13','Demanda liberada','ABERTA','MEDIA',datetime('now'),datetime('now'),20,NULL,'RECICLAGEM')\",\n\"INSERT INTO solicitacoes VALUES(14,'SOL-14','Demanda sem material','ABERTA','MEDIA',datetime('now'),datetime('now'),10,NULL,'RECICLAGEM')\",\n\"INSERT INTO solicitacoes VALUES(15,'SOL-15','Logística','ABERTA','ALTA',datetime('now'),datetime('now'),30,NULL,'LOGISTICA')\",\n\"INSERT INTO solicitacao_itens VALUES(111,11,'PENDENTE','PENDENTE')\",\n\"INSERT INTO solicitacao_itens VALUES(112,12,'PENDENTE','PENDENTE')\",\n\"INSERT INTO solicitacao_itens VALUES(113,13,'PENDENTE','PENDENTE')\",\n\"INSERT INTO solicitacao_itens VALUES(115,15,'PENDENTE','PENDENTE')\"\n].join(';')+';');\nconst service=require('./modules/compras/compras-demandas.service');\nlet r=service.diagnosticarPreCotacoesDemandas();\nassert.equal(r.disponivel,true);\nassert.equal(r.contagens.solicitacoes_com_materiais,4);\nassert.equal(r.contagens.solicitacoes_com_os_e_materiais,1);\nassert.equal(r.contagens.solicitacoes_com_os_sem_vinculo_demanda,1);\nassert.equal(r.contagens.solicitacoes_vinculadas_demanda_com_materiais,3);\nassert.equal(r.contagens.vinculadas_demanda_reciclagem,2);\nassert.equal(r.contagens.vinculadas_demanda_reciclagem_liberadas,1);\nassert.equal(r.contagens.vinculadas_demanda_reciclagem_pendentes,1);\nassert.equal(r.contagens.pre_cotacoes_visiveis_no_card,2);\nassert.deepEqual(r.exemplos_os_sem_demanda,[{solicitacao_id:12,os_id:100}]);\nassert.deepEqual(r.solicitacoes_fora_pre_cotacao.map(v=>[v.solicitacao_id,v.motivo]),[[15,'Origem de outro setor corporativo'],[13,'Compra já liberada: verificar fila normal']]);\ndb.prepare('UPDATE os SET demanda_id=10 WHERE id=100').run();\nr=service.diagnosticarPreCotacoesDemandas();\nassert.equal(r.contagens.solicitacoes_com_os_sem_vinculo_demanda,0);\nassert.equal(r.contagens.pre_cotacoes_visiveis_no_card,3);\nassert.deepEqual(r.exemplos_os_sem_demanda,[]);\nassert.equal(r.solicitacoes_fora_pre_cotacao.length,2);\nprocess.stdout.write('ok');\n"],{
      cwd:path.join(__dirname,'..'),env:{...process.env,DB_PATH:path.join(tmp,'test.sqlite'),NODE_ENV:'test'},
      encoding:'utf8',stdio:['ignore','pipe','pipe'],
    });
    assert.equal(result.trim(),'ok');
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});

test('com lista parcial, a tela oferece conferência de vínculos e motivos sem inventar compras',()=>{
  const root=path.join(__dirname,'..');
  const read=x=>fs.readFileSync(path.join(root,x),'utf8');
  const ctrl=read('modules/compras/compras.controller.js');
  const js=read('public/js/compras-demandas-pre-cotacao.js');
  assert.match(ctrl,/diagnosticarPreCotacoesDemandas/);
  assert.match(js,/Verificar vínculos das solicitações/);
  assert.match(js,/pre-cotacoes\.json\?diagnostico=1/);
  assert.match(js,/Copiar diagnóstico/);\n  assert.match(js,/solicitacoes_fora_pre_cotacao/);
  assert.doesNotMatch(js,/Planejar materiais/);
  assert.match(read('views/layout.ejs'),/compras-demandas-pre-cotacao\.js\?v=20261014-v8/);
});
