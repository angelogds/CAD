'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('card de pré-cotações lista solicitações reais das Demandas, mesmo ainda sem itens', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'cad-pre-cotacoes-compacto-'));
  try {
    const result = execFileSync(process.execPath,['-e',"\nconst assert = require('node:assert/strict');\nconst db = require('./database/db');\ndb.exec([\n\"CREATE TABLE equipamentos(id INTEGER PRIMARY KEY,nome TEXT)\",\n\"CREATE TABLE demandas(id INTEGER PRIMARY KEY,titulo TEXT,status TEXT,prioridade TEXT,aprovacao_status TEXT,prazo_previsto TEXT,nr_referencia TEXT,equipamento_id INTEGER,setor_origem TEXT,liberacao_compras_status TEXT)\",\n\"CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY,numero TEXT,titulo TEXT,status TEXT,prioridade TEXT,created_at TEXT,updated_at TEXT,demanda_id INTEGER,os_id INTEGER,disponivel_compras INTEGER,setor_origem TEXT)\",\n\"CREATE TABLE solicitacao_itens(id INTEGER PRIMARY KEY,solicitacao_id INTEGER,status_cotacao TEXT,status_compra TEXT)\",\n\"INSERT INTO equipamentos VALUES(1,'Digestor 4')\",\n\"INSERT INTO demandas VALUES(1,'Manutenção','PLANEJAMENTO','ALTA','PENDENTE',NULL,NULL,1,'RECICLAGEM','PENDENTE')\",\n\"INSERT INTO demandas VALUES(2,'Logística','PLANEJAMENTO','MEDIA','PENDENTE',NULL,NULL,NULL,'LOGISTICA','PENDENTE')\",\n\"INSERT INTO demandas VALUES(3,'Já liberada','PLANEJAMENTO','BAIXA','PENDENTE',NULL,NULL,NULL,'RECICLAGEM','LIBERADA')\",\n\"INSERT INTO demandas VALUES(4,'Demanda sem solicitação','PLANEJAMENTO','ALTA','PENDENTE',NULL,NULL,NULL,'RECICLAGEM','PENDENTE')\"\n].join(';')+';');\nconst ins = db.prepare(\"INSERT INTO solicitacoes VALUES(?,?,?,'ABERTA',?,datetime('now'),datetime('now'),?,?,0,?)\");\nfor(let id=11;id<=17;id++){\n  ins.run(id,'SOL-'+id,'Material '+id, id===11?'ALTA':'MEDIA',1,null,'RECICLAGEM');\n  db.prepare(\"INSERT INTO solicitacao_itens VALUES(?,?,'PENDENTE','PENDENTE')\").run(id,id);\n}\nins.run(18,'SOL-18','Sem itens','ALTA',1,null,'RECICLAGEM');\nins.run(19,'SOL-19','Logística','MEDIA',2,null,'LOGISTICA');\ndb.prepare(\"INSERT INTO solicitacao_itens VALUES(19,19,'PENDENTE','PENDENTE')\").run();\nins.run(20,'SOL-20','Liberada','BAIXA',3,null,'RECICLAGEM');\ndb.prepare(\"INSERT INTO solicitacao_itens VALUES(20,20,'PENDENTE','PENDENTE')\").run();\nins.run(21,'SOL-21','Material cancelado','ALTA',1,null,'RECICLAGEM');\ndb.prepare(\"INSERT INTO solicitacao_itens VALUES(21,21,'PENDENTE','CANCELADO')\").run();\nconst s=require('./modules/compras/compras-demandas.service');\nassert.equal(s.countPreCotacoesDemandas(),8);\nassert.equal(s.listPreCotacoesDemandas(5).length,5);\nassert.equal(s.listPreCotacoesDemandas(null).length,8);\nconst ids=s.listPreCotacoesDemandas(null).map(x=>x.id);\nassert.equal(ids.includes(18),true); // solicitação existente sem itens continua visível\nassert.equal(ids.includes(19),false);\nassert.equal(ids.includes(20),false);\nassert.equal(ids.includes(21),false);\nassert.ok(ids.includes(11));\nassert.throws(()=>s.assertCompraLiberada(11),/pré-cotação/);\ndb.prepare(\"UPDATE demandas SET liberacao_compras_status='LIBERADA' WHERE id=1\").run();\nassert.equal(s.countPreCotacoesDemandas(),0);\nassert.doesNotThrow(()=>s.assertCompraLiberada(11));\nprocess.stdout.write('ok');\n"], {
      cwd:path.join(__dirname,'..'),encoding:'utf8',
      env:{...process.env,DB_PATH:path.join(dir,'test.sqlite'),NODE_ENV:'test'},
      stdio:['ignore','pipe','pipe'],
    });
    assert.equal(result.trim(),'ok');
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('UI mostra cinco primeiras, contador verdadeiro e expande todas sem criar materiais',()=>{
  const root=path.join(__dirname,'..');
  const read=file=>fs.readFileSync(path.join(root,file),'utf8');
  const controller=read('modules/compras/compras.controller.js');
  const js=read('public/js/compras-demandas-pre-cotacao.js');
  const dbService=read('modules/compras/compras-demandas.service.js');
  const layout=read('views/layout.ejs');
  assert.match(controller,/countPreCotacoesDemandas\(\)/);
  assert.match(controller,/listPreCotacoesDemandas\(verTodas \? null : 5\)/);
  assert.doesNotMatch(controller,/demandasSemMateriais/);
  assert.match(dbService,/LEFT JOIN solicitacao_itens si ON si.solicitacao_id = s.id/);
  assert.match(js,/const INITIAL_VISIBLE = 5/);
  assert.match(js,/Abrir todas as pré-cotações/);
  assert.match(js,/Mostrar apenas 5/);
  assert.match(js,/pre-cotacoes\.json\?todas=1/);
  assert.match(js,/payload\.total/);
  assert.doesNotMatch(js,/Demandas aguardando materiais/);
  assert.doesNotMatch(js,/Planejar materiais/);
  assert.match(layout,/compras-demandas-pre-cotacao\.js\?v=20261014-v7/);
});
