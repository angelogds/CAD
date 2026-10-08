"use strict";
const { gerarRelatorio } = require("./almoxarifado.gerencial.service");
function index(req,res){
  try {
    const dados=gerarRelatorio(req.query||{});
    return res.render("almoxarifado/gerencial",{
      title:"Visão Gerencial do Almoxarifado",activeMenu:"almoxarifado",tab:"painel",dados
    });
  } catch(e) {return res.status(400).send(e.message||"Período inválido.");}
}
module.exports={index};