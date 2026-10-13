"use strict";
const { gerarRelatorio } = require("./almoxarifado.gerencial.service");
const { listarAtrasosPorFornecedor, filtrarAtrasos } = require("./almoxarifado.atrasos-fornecedor.service");
function index(req,res){
  try {
    const dados=gerarRelatorio(req.query||{});
    const pendencias=listarAtrasosPorFornecedor(dados.periodo.hoje);
    const consultaAtrasos=filtrarAtrasos(pendencias,req.query||{});
    return res.render("almoxarifado/gerencial",{
      title:"Visão Gerencial do Almoxarifado",activeMenu:"almoxarifado",tab:"gerencial",dados,pendencias,consultaAtrasos,reposicao:require("../estoque/estoque.reposicao.service").resumo().filter(i=>i.situacao!=="OK"||i.pedido)
    });
  } catch(e) {return res.status(400).send(e.message||"Período inválido.");}
}
module.exports={index};