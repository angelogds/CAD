"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = (filename) => fs.readFileSync(path.join(__dirname, "..", filename), "utf8");

test("estoque apresenta operacoes e recolhe configuracoes", () => {
  const nav = source("views/estoque/_tabs.ejs");
  for (const label of ["Estoque", "Para entregar", "Historico de movimentacoes", "Configuracoes do Almoxarifado", "Cadastrar material", "Categorias", "Locais e prateleiras"]) {
    assert.ok(nav.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(label), "Opcao ausente: " + label);
  }
  assert.match(nav, /stock-tabs-config/);
  assert.match(nav, /estoque-nav-v12\.css/);
  assert.doesNotMatch(nav, /href="\/estoque\/saidas\/nova"/);
});

test("retirada direta e historico continuam independentes", () => {
  const movimentos = source("views/estoque/movimentos.ejs");
  const saida = source("views/estoque/saida_nova.ejs");
  const estoque = source("views/estoque/index.ejs");
  assert.match(movimentos, /href="\/estoque\/saidas\/nova"/);
  assert.match(saida, /action="\/estoque\/saidas"/);
  assert.match(estoque, /href="\/estoque\/saidas\/nova\?item=/);
  assert.doesNotMatch(estoque, /stock-v6-head-actions/);
});

test("cadastro usa menu de configuracoes e links existentes", () => {
  const nav = source("views/estoque/_tabs.ejs");
  const cadastro = source("views/estoque/novo_item.ejs");
  assert.match(cadastro, /tab: 'cadastro'/);
  assert.match(nav, /href="\/estoque\/itens\/novo"/);
  assert.match(nav, /href="\/estoque\/categorias"/);
  assert.match(nav, /href="\/estoque\/locais"/);
});
