"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {periodoSeguro,consolidar}=require("../modules/almoxarifado/almoxarifado.gerencial.service");
const hoje="2026-10-08";
test("períodos semana, mês e personalizado são delimitados",()=>{
 assert.deepEqual(periodoSeguro({periodo:"7d"},hoje).inicio,"2026-10-02");
 assert.equal(periodoSeguro({periodo:"mes"},hoje).inicio,"2026-10-01");
 assert.throws(()=>periodoSeguro({periodo:"personalizado",inicio:"2026-01-01",fim:"2026-11-01"},hoje));
 assert.throws(()=>periodoSeguro({periodo:"personalizado",inicio:"2026-10-05",fim:"2026-10-01"},hoje));
});
test("não soma unidades diferentes nem ajustes de inventário",()=>{
 const p=periodoSeguro({periodo:"30d"},hoje);
 const itens=[{id:1,nome:"Bomba",unidade:"UN",saldo_atual:2,custo_unit:100,created_at:"2026-01-01"},
 {id:2,nome:"Graxa",unidade:"KG",saldo_atual:3,custo_unit:10,created_at:"2026-01-01"}];
 const movs=[{item_id:1,tipo:"ENTRADA_COMPRA",quantidade:2,custo_unit:100,data_mov:"2026-10-03"},
 {item_id:2,tipo:"SAIDA_REQUISICAO_INTERNA",quantidade:1,custo_unit:10,data_mov:"2026-10-04"},
 {item_id:1,tipo:"AJUSTE_ENTRADA",quantidade:200,data_mov:"2026-10-03"}];
 const d=consolidar(itens,movs,[],p);
 assert.equal(d.resumo.estoqueCentavos,23000);
 assert.equal(d.resumo.valorEntradaCentavos,20000);
 assert.equal(d.resumo.valorSaidaCentavos,1000);
 assert.equal(d.resumo.registrosEntrada,1);
 assert.equal(d.resumo.registrosSaida,1);
 assert.equal(d.maisSaidos[0].unidade,"KG");
});
test("custos faltantes são identificados sem fabricar valores; material novo não vira parado",()=>{
 const p=periodoSeguro({periodo:"30d"},hoje);
 const d=consolidar([{id:1,nome:"Antigo",saldo_atual:8,created_at:"2026-01-01"},
 {id:2,nome:"Novo",saldo_atual:4,created_at:"2026-10-01"}],
 [{item_id:1,tipo:"SAIDA_MANUAL",quantidade:2,data_mov:"2026-10-04"}],[],p);
 assert.equal(d.resumo.estoqueCentavos,0);
 assert.equal(d.resumo.itensSemValor,2);
 assert.equal(d.resumo.saidasSemPreco,1);
 assert.equal(d.parados.length,0); // Uma saída recente impede classificar o item como parado.
 assert.equal(d.resumo.parados90d,0);
});
test("movimentação com custo de Compras em centavos substitui estimativa de estoque",()=>{
 const p=periodoSeguro({periodo:"7d"},hoje);
 const d=consolidar([{id:4,nome:"Correia",saldo_atual:1,custo_unit:25,created_at:"2026-01-01"}],
 [{item_id:4,tipo:"SAIDA_REQUISICAO_INTERNA",quantidade:2,valor_unitario_centavos:1200,data_mov:"2026-10-08"}],[],p);
 assert.equal(d.resumo.valorSaidaCentavos,2400);
 assert.equal(d.resumo.valoresEstimados,0);
});
