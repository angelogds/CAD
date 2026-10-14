'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('card oferece demandas técnicas da Reciclagem sem materiais, sem misturar Logística e Frigorífico', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'compras-card-demandas-'));
  try {
    const out = execFileSync(process.execPath,['-e',"\nconst assert = require('node:assert/strict');\nconst db = require('./database/db');\ndb.exec([\n\"CREATE TABLE equipamentos(id INTEGER PRIMARY KEY, nome TEXT, setor TEXT)\",\n\"CREATE TABLE demandas(id INTEGER PRIMARY KEY, titulo TEXT, status TEXT, prioridade TEXT, categoria TEXT, setor_origem TEXT, equipamento_id INTEGER, aprovacao_status TEXT, created_at TEXT, updated_at TEXT, liberacao_compras_status TEXT)\",\n\"CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY, demanda_id INTEGER, status TEXT)\",\n\"INSERT INTO equipamentos VALUES(1,'Digestor 4','RECICLAGEM')\",\n\"INSERT INTO equipamentos VALUES(2,'Equipamento frigorífico','FRIGORIFICO')\",\n\"INSERT INTO demandas VALUES(1,'Manutenção sem setor','PLANEJAMENTO','ALTA','MANUTENCAO',NULL,NULL,'PENDENTE',datetime('now'),datetime('now'),'PENDENTE')\",\n\"INSERT INTO demandas VALUES(2,'Triturador FAST','NOVA','URGENTE','PROJETO','Reciclagem',NULL,'PENDENTE',datetime('now'),datetime('now'),'PENDENTE')\",\n\"INSERT INTO demandas VALUES(3,'Logística','PLANEJAMENTO','ALTA','MANUTENCAO','LOGISTICA',NULL,'PENDENTE',datetime('now'),datetime('now'),'PENDENTE')\",\n\"INSERT INTO demandas VALUES(4,'Frigorífico','NOVA','ALTA','MANUTENCAO',NULL,2,'PENDENTE',datetime('now'),datetime('now'),'PENDENTE')\",\n\"INSERT INTO demandas VALUES(5,'Demanda com materiais','PLANEJAMENTO','MEDIA','MANUTENCAO','RECICLAGEM',NULL,'PENDENTE',datetime('now'),datetime('now'),'PENDENTE')\",\n\"INSERT INTO demandas VALUES(6,'Demanda concluída','CONCLUIDA','BAIXA','MANUTENCAO','RECICLAGEM',NULL,'PENDENTE',datetime('now'),datetime('now'),'PENDENTE')\",\n\"INSERT INTO demandas VALUES(7,'Demanda liberada','PLANEJAMENTO','BAIXA','MANUTENCAO','RECICLAGEM',NULL,'PENDENTE',datetime('now'),datetime('now'),'LIBERADA')\",\n\"INSERT INTO demandas VALUES(8,'Rotor Digestor','PLANEJAMENTO','BAIXA','PROJETO',NULL,1,'PENDENTE',datetime('now'),datetime('now'),'PENDENTE')\",\n\"INSERT INTO demandas VALUES(9,'Melhoria administrativa sem setor','NOVA','MEDIA','PROJETO',NULL,NULL,'PENDENTE',datetime('now'),datetime('now'),'PENDENTE')\",\n\"INSERT INTO solicitacoes VALUES(51,5,'EM_COTACAO')\"\n].join(';')+';');\nconst s=require('./modules/compras/compras-demandas.service');\nlet list=s.listDemandasSemMateriais(30);\nassert.deepEqual(list.map(x=>x.demanda_id).sort((a,b)=>a-b),[1,2,8]);\nassert.equal(list.find(x=>x.demanda_id===8).equipamento_nome,'Digestor 4');\ndb.prepare(\"UPDATE solicitacoes SET status='CANCELADA' WHERE id=51\").run();\nlist=s.listDemandasSemMateriais(30);\nassert.equal(list.some(x=>x.demanda_id===5),true);\ndb.prepare(\"UPDATE demandas SET liberacao_compras_status='LIBERADA' WHERE id=2\").run();\nlist=s.listDemandasSemMateriais(30);\nassert.equal(list.some(x=>x.demanda_id===2),false);\nprocess.stdout.write('ok');\n"],{
      cwd:path.join(__dirname,'..'), encoding:'utf8',
      env:{ ...process.env,DB_PATH:path.join(dir,'test.sqlite'),NODE_ENV:'test' },
      stdio:['ignore','pipe','pipe']
    });
    assert.equal(out.trim(),'ok');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('UI mantém pré-cotações reais separadas das demandas sem materiais', () => {
  const root=path.join(__dirname,'..');
  const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  const ctrl=read('modules/compras/compras.controller.js');
  const view=read('public/js/compras-demandas-pre-cotacao.js');
  const layout=read('views/layout.ejs');
  assert.match(ctrl,/demandasSemMateriais: demandasComprasService\.listDemandasSemMateriais/);
  assert.match(view,/Demandas aguardando materiais/);
  assert.match(view,/Sem solicitação de materiais/);
  assert.match(view,/Não é uma cotação/);
  assert.match(view,/demandas\/\$\{demand\.demanda_id\}#materiais/);
  assert.match(view,/rows\.length \+ demandasSemMateriais\.length/);
  assert.match(layout,/compras-demandas-pre-cotacao\.js\?v=20261014-v3/);
  assert.match(read('modules/compras/compras.service.js'),/function demandReleaseWhere/);
});
