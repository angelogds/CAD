"use strict";
const { gerarRelatorio } = require("./almoxarifado.gerencial.service");
const { listarAtrasosPorFornecedor } = require("./almoxarifado.atrasos-fornecedor.service");
function index(req,res){
  try {
    const dados=gerarRelatorio(req.query||{});
    const pendencias=listarAtrasosPorFornecedor(dados.periodo.hoje);
    return res.render("almoxarifado/gerencial",{
      title:"Visão Gerencial do Almoxarifado",activeMenu:"almoxarifado",tab:"gerencial",dados,pendencias,reposicao:require("../estoque/estoque.reposicao.service").resumo().filter(i=>i.situacao!=="OK"||i.pedido)
    });
  } catch(e) {return res.status(400).send(e.message||"Período inválido.");}
}
module.exports={index};