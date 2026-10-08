"use strict";
const PDFDocument = require("pdfkit");
const { gerarRelatorio } = require("./almoxarifado.gerencial.service");
const brl = v => (Number(v || 0) / 100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const qtd = v => Number(v || 0).toLocaleString("pt-BR", {maximumFractionDigits: 2});
function exportar(req,res) {
  let info;
  try { info = gerarRelatorio(req.query || {}); }
  catch(e) { return res.status(400).send(e.message); }
  const {periodo,resumo,maisSaidos,parados,inventario,serie} = info;
  const doc = new PDFDocument({size:"A4", margin:42, bufferPages:true, info:{Title:"Almoxarifado - relatório gerencial"}});
  res.setHeader("Content-Type","application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="almoxarifado-gerencial-${periodo.inicio}-${periodo.fim}.pdf"`);
  doc.pipe(res);
  const black = "#24352f",green="#1c7848",gray="#62746d";
  const heading=(s)=>{
    if(doc.y>690) doc.addPage();
    doc.moveDown(.8).font("Helvetica-Bold").fontSize(13).fillColor(green).text(s);
    doc.moveDown(.3);
  };
  const line=(left,right)=>{
    if(doc.y>748) doc.addPage();
    const y=doc.y;
    doc.fillColor(black).font("Helvetica").fontSize(9).text(String(left),42,y,{width:354});
    doc.font("Helvetica-Bold").text(String(right),400,y,{width:155,align:"right"});
    doc.moveDown(.5);
  };
  doc.fillColor(green).font("Helvetica-Bold").fontSize(18).text("ALMOXARIFADO | RELATÓRIO GERENCIAL");
  doc.fillColor(gray).fontSize(9).font("Helvetica").text(`Manutenção Campo do Gado  •  Período: ${periodo.inicio} a ${periodo.fim}`);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}`);
  heading("Resumo de entradas, saídas e estoque");
  line("Materiais com saldo atual",resumo.itensComSaldo);
  line("Valor estimado em estoque (itens precificados)",brl(resumo.estoqueCentavos));
  line("Materiais com saldo sem custo cadastrado",resumo.itensSemValor);
  line("Registros de entrada no período",resumo.registrosEntrada);
  line("Custo de entradas registrado/estimado",brl(resumo.valorEntradaCentavos));
  line("Registros de retirada no período",resumo.registrosSaida);
  line("Custo de saídas registrado/estimado",brl(resumo.valorSaidaCentavos));
  line("Movimentações sem preço de entrada/saída",`${resumo.entradasSemPreco} / ${resumo.saidasSemPreco}`);
  heading("Movimentação no período");
  if (!serie.length) doc.fontSize(9).text("Sem entradas ou saídas registradas no intervalo.");
  serie.forEach(v=>line(v.data, `${v.entradas} entradas / ${v.saidas} saídas`));
  heading("Materiais mais retirados (por número de retiradas)");
  if (!maisSaidos.length) doc.fontSize(9).text("Nenhuma retirada no período.");
  maisSaidos.forEach((i,n)=>line(`${n+1}. ${i.nome} (${i.unidade})`,`${qtd(i.qtdSaida)} / ${i.saidas} retiradas`));
  heading("Materiais sem saídas há 90 dias ou mais");
  doc.fillColor(gray).fontSize(8).text("Lista de atenção; avaliar criticidade e reserva mínima antes de reduzir compras.");
  if (!parados.length) doc.fontSize(9).text("Nenhum item antigo com saldo e sem saída identificado.");
  parados.forEach(i=>line(i.nome,`${qtd(i.saldo)} ${i.unidade} em estoque`));
  doc.addPage();
  doc.fillColor(green).fontSize(14).font("Helvetica-Bold").text("Inventário valorizado - saldo atual");
  doc.moveDown(.4);
  inventario.forEach(i=>line(`${i.nome} — ${qtd(i.saldo)} ${i.unidade}`,i.valorSaldoCentavos==null?"Custo não cadastrado":brl(i.valorSaldoCentavos)));
  doc.moveDown(.8).fillColor(gray).fontSize(8).text(
    "Notas: preços históricos da movimentação prevalecem; na ausência, usa-se o valor da compra vinculada ou, como estimativa, o custo atual do estoque. Ajustes de inventário não são tratados como entradas/saídas operacionais. Materiais sem custo não entram nos totais monetários. Quantidades de unidades diferentes não são somadas. Este relatório é gerencial, não substitui escrituração contábil."
  );
  const pages=doc.bufferedPageRange();
  for(let i=pages.start;i<pages.start+pages.count;i++){
    doc.switchToPage(i);
    doc.fillColor(gray).fontSize(8).text(`Campo do Gado · Almoxarifado | Página ${i+1}/${pages.count}`,42,790,{width:510,align:"right"});
  }
  doc.end();
}
module.exports={exportar};
