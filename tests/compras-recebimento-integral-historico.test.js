const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');

const read = rel => fs.readFileSync(path.join(__dirname,'..',rel),'utf8');
const service = require('../modules/compras/compras.service');

test('compras move recebidas, separadas e entregues para o histórico sem mudar o status físico',()=>{
  for(const status of ['RECEBIDA_TOTAL','SEPARADA_PARA_RETIRADA','ENTREGUE_SOLICITANTE','FECHADA','CANCELADA']){
    assert.equal(service.isOperationallyActive({status}),false,status);
  }
  for(const status of ['ABERTA','EM_COTACAO','COMPRADA','EM_RECEBIMENTO','RECEBIDA_PARCIAL','AGUARDANDO_APROVACAO','REABERTA']){
    assert.equal(service.isOperationallyActive({status}),true,status);
  }
});

function aggregarComDados() {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE solicitacao_itens (solicitacao_id INTEGER, status_compra TEXT, status_cotacao TEXT, qtd_comprada REAL, qtd_solicitada REAL, qtd_recebida_total REAL, aprovacao_item_status TEXT)");
  const registrar=db.prepare("INSERT INTO solicitacao_itens(solicitacao_id,status_compra,status_cotacao,qtd_comprada,qtd_solicitada,qtd_recebida_total,aprovacao_item_status) VALUES (?,?, 'COTADO',?,?,?,?)");
  registrar.run(2,'COMPRADO',10,10,10,'APROVADA');
  registrar.run(2,'COMPRADO',3,3,3,'APROVADA');
  registrar.run(3,'COMPRADO',10,10,6,'APROVADA');
  registrar.run(4,'COMPRADO',10,10,10,'APROVADA');
  registrar.run(4,'PENDENTE',0,5,0,null);
  registrar.run(5,'COMPRADO',4,4,4,'PENDENTE');
  registrar.run(6,'COMPRADO',2,2,2,'APROVADA');
  registrar.run(6,'CANCELADO',0,2,0,null);
  registrar.run(7,'COMPRADO',4,4,4,'APROVADA');
  registrar.run(8,'COMPRADO',6,6,6,'APROVADA');
  registrar.run(10,'ATENDIDO_ESTOQUE',0,1,0,null);
  const src=read('modules/compras/compras.controller.js');
  const group=src.match(/function applyActiveItemCounters\(rows\) \{[\s\S]*?\n\}\n\nfunction getOperationalQueue/);
  assert.ok(group,'Agregador da fila operacional não localizado');
  const exec=group[0].replace(/\n\nfunction getOperationalQueue$/,'');
  const sandbox={
    db,
    hasColumn:(table,column)=>db.pragma('table_info(' + table + ')').some(c=>c.name===column),
    Set,Map,Number,Array
  };
  const aggregate=vm.runInNewContext(exec+'\napplyActiveItemCounters;',sandbox);
  return {db,rows:aggregate([2,3,4,5,6,7,8,10,11].map(id=>({id,status:id===7?'REABERTA':id===8?'RECEBIDA_PARCIAL':'COMPRADA'})))};
}

test('conferência 100% retira da fila, mas mantém parciais e aprovações pendentes',()=>{
  const {db,rows}=aggregarComDados();
  try{
    const status=new Map(rows.map(row=>[Number(row.id),service.isOperationallyActive(row)]));
    assert.equal(status.get(2),false,'100% comprado e recebido');
    assert.equal(status.get(3),true,'recebimento incompleto');
    assert.equal(status.get(4),true,'há outro item ainda aguardando compra');
    assert.equal(status.get(5),true,'diretoria ainda não liberou a compra');
    assert.equal(status.get(6),false,'item cancelado não impede encerramento');
    assert.equal(status.get(7),true,'pedido reaberto continua na fila');
    assert.equal(status.get(8),false,'parcial desatualizada mas 100% fisicamente recebida');
    assert.equal(status.get(10),true,'sem item comprado/recebido não pode ser arquivado por engano');
    assert.equal(status.get(11),true,'sem itens não pode ser arquivado');
  } finally {db.close();}
});

test('fila, dashboard e almoxarifado compartilham conclusão após recebimento',()=>{
  const ctrl=read('modules/compras/compras.controller.js');
  const dashboard=read('modules/compras/compras.dashboard.service.js');
  const almox=read('modules/almoxarifado/almoxarifado.controller.js');
  const view=read('views/compras/solicitacoes/index.ejs');
  assert.match(ctrl,/activeRows = allRows\.filter\(\(row\) => service\.isOperationallyActive\(row\)\)/);
  assert.match(ctrl,/historyRows = allRows\.filter\(\(row\) => !service\.isOperationallyActive\(row\)\)/);
  assert.match(dashboard,/CLOSED_RECEIPT_STATUSES[\s\S]*?'SEPARADA_PARA_RETIRADA'/);
  assert.match(almox,/Compras a receber: encerrado o recebimento/);
  assert.match(view,/Fechadas e histórico/);
  assert.match(view,/100% RECEBIDO NO ALMOXARIFADO/);
});
