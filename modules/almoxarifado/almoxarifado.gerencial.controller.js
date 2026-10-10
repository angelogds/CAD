"use strict";
const { gerarRelatorio } = require("./almoxarifado.gerencial.service");
function index(req,res){
  try {
    const dados=gerarRelatorio(req.query||{});
    return res.render("almoxarifado/gerencial",{
      title:"Visão Gerencial do Almoxarifado",activeMenu:"almoxarifado",tab:"painel",dados,reposicao:require("../estoque/estoque.reposicao.service").resumo().filter(i=>i.situacao!=="OK"||i.pedido)
    });
  } catch(e) {return res.status(400).send(e.message||"Período inválido.");}
}
module.exports={index};