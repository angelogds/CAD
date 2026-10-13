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
