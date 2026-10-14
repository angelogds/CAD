"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const raiz = path.join(__dirname, "..");
const conteudo = file => fs.readFileSync(path.join(raiz,file), "utf8");

test("V15 compila template EJS da Visão Gerencial e mantém seis abas", () => {
  assert.doesNotThrow(() => ejs.compile(conteudo("views/almoxarifado/gerencial.ejs"), {filename:path.join(raiz,"views/almoxarifado/gerencial.ejs")}));
  const nav = conteudo("views/almoxarifado/_tabs.ejs");
  assert.match(nav,/almoxarifado-layout-v15.css/);
  assert.equal((nav.match(/class="almox-tab /g) || []).length,6);
});

test("V15 conecta filtros do controller ao serviço sem modificar o fluxo de recebimento", () => {
  const ctrl = conteudo("modules/almoxarifado/almoxarifado.gerencial.controller.js");
  const pdf = conteudo("modules/almoxarifado/almoxarifado.gerencial.pdf.js");
  const view = conteudo("views/almoxarifado/gerencial.ejs");
  assert.match(ctrl,/consultaAtrasos=filtrarAtrasos\(pendencias,req.query/);
  assert.match(pdf,/filtrarAtrasos\(pendencias, req.query/);
  assert.match(pdf,/for \(const item of consultaAtrasos\.atrasados\)/);
  assert.match(pdf,/for \(const item of consultaAtrasos\.semPrevisao\)/);
  assert.match(view,/name="fornecedor"/);
  assert.match(view,/name="busca"/);
  assert.match(view,/name="tipo"/);
  assert.match(view,/consultaAtrasos\.itens\.forEach/);
  assert.match(view,/consultaAtrasos\.paginacao\.pagina/);
  assert.match(view,/\/almoxarifado\/gerencial\/pdf/);
  assert.match(view,/\/almoxarifado\/solicitacoes\//);
});


test("V15 renderiza a tela com paginação e textos escapados usando dados simulados", () => {
  const { gerarResumoAtrasos, filtrarAtrasos } = require("../modules/almoxarifado/almoxarifado.atrasos-fornecedor.service");
  const linhas=Array.from({length:22},(_,i)=>({
    solicitacao_id:100+i,numero:"SOL-"+(100+i),
    item_nome:i===0?"<script>inseguro</script>":"Material "+i,
    fornecedor_nome:"Fornecedor A",unidade:"UN",
    qtd_comprada:2,qtd_recebida:1,previsao_entrega:"2026-10-10"
  }));
  const pendencias=gerarResumoAtrasos(linhas,"2026-10-13");
  const consultaAtrasos=filtrarAtrasos(pendencias,{pagina:2});
  const dados={
    periodo:{modo:"30d",inicio:"2026-09-14",fim:"2026-10-13",hoje:"2026-10-13"},
    resumo:{estoqueCentavos:0,valorEntradaCentavos:0,valorSaidaCentavos:0,itensComSaldo:0,registrosEntrada:0,registrosSaida:0,itensSemValor:0,entradasSemPreco:0,saidasSemPreco:0,valoresEstimados:0},
    serie:[],movimentacaoPorSetorCategoria:[],maisSaidos:[],parados:[],inventario:[]
  };
  const html=ejs.render(conteudo("views/almoxarifado/gerencial.ejs"),{
    layout(){},tab:"gerencial",dados,pendencias,consultaAtrasos,reposicao:[]
  },{filename:path.join(raiz,"views/almoxarifado/gerencial.ejs")});
  assert.match(html,/Página 2 de 2/);
  assert.match(html,/SOL-12[01]/);
  assert.match(html,/PDF desta pesquisa/);
  assert.match(html,/almoxarifado-layout-v15\.css/);
  assert.ok(!html.includes("<script>inseguro</script>"));
  const htmlPrimeira=ejs.render(conteudo("views/almoxarifado/gerencial.ejs"),{
    layout(){},tab:"gerencial",dados,pendencias,consultaAtrasos:filtrarAtrasos(pendencias,{}),reposicao:[]
  },{filename:path.join(raiz,"views/almoxarifado/gerencial.ejs")});
  assert.match(htmlPrimeira,/&lt;script&gt;inseguro&lt;\/script&gt;/);
});
