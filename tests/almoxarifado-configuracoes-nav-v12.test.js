"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = (filename) => fs.readFileSync(path.join(__dirname, "..", filename), "utf8");

test("estoque compartilha os quatro acessos e apresenta operações em cards", () => {
  const nav = source("views/estoque/_tabs.ejs");
  const cards = source("views/almoxarifado/_stock-operations.ejs");
  assert.match(nav, /almoxarifado\/_tabs/);
  for (const label of ["Materiais retirados", "Materiais separados", "Correias", "Cadastros e organização", "Cadastrar material", "Categorias", "Locais e prateleiras"]) assert.ok(cards.includes(label));
  assert.match(cards, /<details/);
  assert.doesNotMatch(nav, /stock-tabs-config/);
});

test("retirada direta e historico continuam independentes", () => {
  const movimentos = source("views/estoque/movimentos.ejs");
  const saida = source("views/estoque/saida_nova.ejs");
  const estoque = source("views/estoque/index.ejs");
  assert.match(movimentos, /href="\/estoque\/saidas\/nova"/);
  assert.match(saida, /include\('\.\.\/almoxarifado\/retirada_qr'/);
  assert.match(estoque, /href="\/estoque\/saidas\/nova\?item=/);
  assert.doesNotMatch(estoque, /stock-v6-head-actions/);
});

test("cadastro usa menu de configuracoes e links existentes", () => {
  const nav = source("views/almoxarifado/_stock-operations.ejs");
  const cadastro = source("views/estoque/novo_item.ejs");
  assert.match(cadastro, /tab: 'cadastro'/);
  assert.match(nav, /href="\/estoque\/itens\/novo"/);
  assert.match(nav, /href="\/estoque\/categorias"/);
  assert.match(nav, /href="\/estoque\/locais"/);
});
