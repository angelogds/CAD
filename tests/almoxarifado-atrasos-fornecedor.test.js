"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isoValida, gerarResumoAtrasos } = require("../modules/almoxarifado/almoxarifado.atrasos-fornecedor.service");

const data="2026-10-13";
const material = (alteracoes={}) => ({
  solicitacao_id: 10, numero: "SOL-010", item_nome: "Correia",
  unidade: "UN", qtd_comprada: 10, qtd_recebida: 4,
  fornecedor_nome: "Fornecedor Alfa", previsao_entrega: "2026-10-10",
  ...alteracoes
});

test("atraso usa saldo do item e não soma quantidades de unidades distintas", () => {
  const rel=gerarResumoAtrasos([
    material(),
    material({item_nome:"Óleo",unidade:"L",qtd_comprada:8,qtd_recebida:0}),
    material({item_nome:"Item completo",qtd_comprada:5,qtd_recebida:5}),
  ],data);
  assert.equal(rel.resumo.itensAtrasados,2);
  assert.equal(rel.resumo.pedidosAtrasados,1);
  assert.equal(rel.resumo.fornecedoresAtrasados,1);
  assert.equal(rel.porFornecedor[0].pedidosAtrasados,1);
  assert.deepEqual(rel.atrasados.map(i=>[i.nome,i.pendente,i.unidade,i.diasAtraso]),
    [["Correia",6,"UN",3],["Óleo",8,"L",3]]);
});

test("prazo vencido, dia atual, futuro e sem previsão são classes independentes", () => {
  const rel=gerarResumoAtrasos([
    material({previsao_entrega:"2026-10-12"}),
    material({solicitacao_id:11,previsao_entrega:"2026-10-13"}),
    material({solicitacao_id:12,previsao_entrega:"2026-10-14"}),
    material({solicitacao_id:13,previsao_entrega:null}),
    material({solicitacao_id:14,previsao_entrega:"2026-02-30"})
  ],data);
  assert.equal(rel.resumo.itensAtrasados,1);
  assert.equal(rel.resumo.itensNoPrazo,2);
  assert.equal(rel.resumo.semPrevisao,2);
  assert.equal(rel.atrasados[0].diasAtraso,1);
});

test("resumo ordena fornecedores, separa pedidos e preserva fornecedor desconhecido", () => {
  const rel=gerarResumoAtrasos([
    material({fornecedor_nome:"Zulu",solicitacao_id:10,previsao_entrega:"2026-09-13"}),
    material({fornecedor_nome:"zulu",solicitacao_id:11}),
    material({fornecedor_nome:"Alfa",solicitacao_id:12}),
    material({fornecedor_nome:"",solicitacao_id:13}),
  ],data);
  assert.equal(rel.porFornecedor.length,3);
  assert.equal(rel.porFornecedor[0].itensAtrasados,2);
  assert.equal(rel.porFornecedor[0].pedidosAtrasados,2);
  assert.equal(rel.porFornecedor[0].maiorAtrasoDias,30);
  assert.equal(rel.atrasados.length,4);
  assert.ok(rel.atrasados.some(i=>i.fornecedor==="Fornecedor não informado"));
});

test("compra nula, recebimento completo e quantidades inválidas não são pendência", () => {
  const rel=gerarResumoAtrasos([
    material({qtd_comprada:0}),
    material({qtd_comprada:4,qtd_recebida:5}),
    material({qtd_comprada:"invalido"}),
    material({qtd_recebida:Infinity}),
    material({qtd_comprada:3,qtd_recebida:-1})
  ],data);
  assert.equal(rel.resumo.itensAtrasados,1);
  assert.equal(rel.atrasados[0].pendente,3);
  assert.ok(rel.atrasados.every(i=>i.pendente>0));
});

test("validação ISO não considera datas impossíveis como atraso", () => {
  assert.equal(isoValida("2026-02-30"),"");
  assert.equal(isoValida("2026-10-12"),"2026-10-12");
  assert.equal(isoValida("amanha"),"");
  assert.throws(()=>gerarResumoAtrasos([],"2026-14-99"));
});


test("consulta SQL real preserva fornecedores por item, recebimentos parciais e prazo do cabeçalho", () => {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE fornecedores(id INTEGER PRIMARY KEY, nome TEXT, nome_fantasia TEXT);
      CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY, numero TEXT, status TEXT, fornecedor TEXT, previsao_entrega TEXT);
      CREATE TABLE solicitacao_itens(
        id INTEGER PRIMARY KEY, solicitacao_id INTEGER, item_nome TEXT, item_descricao TEXT,
        unidade TEXT, qtd_comprada REAL, qtd_recebida_total REAL, fornecedor_id INTEGER, previsao_entrega TEXT
      );
      INSERT INTO fornecedores VALUES(1,'Fábrica A','Alfa'),(2,'Fábrica B','Beta');
      INSERT INTO solicitacoes VALUES
        (10,'SOL-010','EM_COTACAO','Fornecedor do cabeçalho','2026-10-12'),
        (11,'SOL-011','COMPRADA',NULL,NULL),
        (12,'SOL-012','ABERTA',NULL,'2026-10-01');
      INSERT INTO solicitacao_itens VALUES
        (1,10,'Correia',NULL,'UN',10,4,1,'2026-10-10'),
        (2,10,'Óleo',NULL,'L',5,1,2,NULL),
        (3,10,'Item sem compra',NULL,'UN',0,0,1,'2026-10-08'),
        (4,10,'Item recebido',NULL,'UN',5,5,1,'2026-10-08'),
        (5,11,'Parafuso',NULL,'UN',12,0,NULL,NULL),
        (6,12,'Solicitação aberta',NULL,'UN',9,0,NULL,'2026-10-01');
    `);
    const antes = db.prepare("SELECT SUM(qtd_recebida_total) total FROM solicitacao_itens").get().total;
    const rel = require("../modules/almoxarifado/almoxarifado.atrasos-fornecedor.service")
      .listarAtrasosPorFornecedor(data,{db,status:["EM_COTACAO","COMPRADA","EM_RECEBIMENTO"]});
    assert.equal(rel.resumo.itensAtrasados,2);
    assert.equal(rel.resumo.fornecedoresAtrasados,2);
    assert.equal(rel.resumo.pedidosAtrasados,1);
    assert.equal(rel.resumo.semPrevisao,1);
    assert.equal(rel.atrasados.find(i=>i.nome==="Correia").pendente,6);
    assert.equal(rel.atrasados.find(i=>i.nome==="Correia").fornecedor,"Alfa");
    assert.equal(rel.atrasados.find(i=>i.nome==="Óleo").fornecedor,"Beta");
    assert.equal(rel.atrasados.find(i=>i.nome==="Óleo").previsao,"2026-10-12");
    assert.equal(rel.semPrevisao[0].nome,"Parafuso");
    assert.equal(db.prepare("SELECT SUM(qtd_recebida_total) total FROM solicitacao_itens").get().total,antes);
  } finally {
    db.close();
  }
});
