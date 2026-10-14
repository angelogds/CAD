'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('card da Reciclagem lista pré-cotações mesmo com setor variável, rascunho ou OS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-prequotecard-'));
  const script = "\nconst assert = require('node:assert/strict');\nconst db = require('./database/db');\ndb.exec([\n  \"CREATE TABLE equipamentos(id INTEGER PRIMARY KEY,nome TEXT)\",\n  \"CREATE TABLE demandas(id INTEGER PRIMARY KEY,titulo TEXT,status TEXT,prioridade TEXT,aprovacao_status TEXT,prazo_previsto TEXT,nr_referencia TEXT,equipamento_id INTEGER,setor_origem TEXT,liberacao_compras_status TEXT)\",\n  \"CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY,numero TEXT,titulo TEXT,status TEXT,prioridade TEXT,created_at TEXT,updated_at TEXT,demanda_id INTEGER,os_id INTEGER,disponivel_compras INTEGER,setor_origem TEXT)\",\n  \"CREATE TABLE solicitacao_itens(id INTEGER PRIMARY KEY,solicitacao_id INTEGER,status_cotacao TEXT,status_compra TEXT)\",\n  \"INSERT INTO equipamentos VALUES(1,'Digestor 4')\",\n  \"INSERT INTO demandas VALUES(5,'Reforma Digestor 4','PLANEJAMENTO','ALTA','PENDENTE',NULL,NULL,1,'Reciclagem','PENDENTE')\",\n  \"INSERT INTO demandas VALUES(7,'Projeto manutenção','PLANEJAMENTO','BAIXA','PENDENTE',NULL,NULL,1,'Manutenção','PENDENTE')\",\n  \"INSERT INTO demandas VALUES(8,'Projeto Logística','PLANEJAMENTO','ALTA','PENDENTE',NULL,NULL,NULL,'LOGISTICA','PENDENTE')\",\n  \"INSERT INTO solicitacoes VALUES(51,'SOL-051','Materiais da demanda 5','ABERTA','ALTA',datetime('now'),datetime('now'),5,NULL,0,'  reciclagem  ')\",\n  \"INSERT INTO solicitacoes VALUES(71,'SOL-071','Materiais da demanda 7','EM_COTACAO','BAIXA',datetime('now'),datetime('now'),7,500,1,'')\",\n  \"INSERT INTO solicitacoes VALUES(81,'SOL-081','Materiais da demanda 8','ABERTA','ALTA',datetime('now'),datetime('now'),8,NULL,1,'LOGISTICA')\",\n  \"INSERT INTO solicitacao_itens VALUES(1,51,'COTADO','PENDENTE')\",\n  \"INSERT INTO solicitacao_itens VALUES(2,51,'PENDENTE','PENDENTE')\",\n  \"INSERT INTO solicitacao_itens VALUES(3,71,'COTADO','PENDENTE')\"\n].join(';')+';');\nconst service = require('./modules/compras/compras-demandas.service');\nlet rows=service.listPreCotacoesDemandas(50);\nassert.deepEqual(rows.map(row=>row.id),[51,71]); // Reciclagem, incluindo setor com espaços e fallback à Demanda\nassert.equal(rows[0].itens_cotados,1);\nassert.equal(rows[0].itens_count,2);\nassert.throws(()=>service.assertCompraLiberada(51),/pré-cotação/);\nassert.throws(()=>service.assertCompraLiberada(71),/pré-cotação/); // OS não autoriza\ndb.prepare(\"UPDATE demandas SET liberacao_compras_status='LIBERADA' WHERE id=5\").run();\nrows=service.listPreCotacoesDemandas(50);\nassert.deepEqual(rows.map(row=>row.id),[71]);\nassert.doesNotThrow(()=>service.assertCompraLiberada(51));\ndb.prepare(\"UPDATE demandas SET liberacao_compras_status='LIBERADA' WHERE id=7\").run();\nassert.deepEqual(service.listPreCotacoesDemandas(50),[]);\nassert.doesNotThrow(()=>service.assertCompraLiberada(71));\nprocess.stdout.write('ok');\n";
  try {
    const output = execFileSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'test', DB_PATH: path.join(dir, 'db.sqlite') },
      encoding: 'utf8',
      stdio: ['ignore','pipe','pipe']
    });
    assert.equal(output.trim(), 'ok');
  } finally {
    fs.rmSync(dir, { recursive:true, force:true });
  }
});

test('card mostra ação de cotar e fila continua separada por criticidade após liberação', () => {
  const root=path.join(__dirname,'..');
  const pre=fs.readFileSync(path.join(root,'public/js/compras-demandas-pre-cotacao.js'),'utf8');
  const queue=fs.readFileSync(path.join(root,'modules/compras/compras.service.js'),'utf8');
  const view=fs.readFileSync(path.join(root,'views/compras/solicitacoes/index.ejs'),'utf8');
  assert.match(pre,/Abrir e preparar cotação/);
  assert.match(pre,/Pré-cotação em preparação/);
  assert.match(queue,/function demandReleaseWhere/);
  assert.match(queue,/priorityGroup: priorityGroup\(row\.prioridade\)/);
  assert.match(view,/groupDefs\.forEach/);
  assert.match(view,/s\.priorityGroup===group/);
});
