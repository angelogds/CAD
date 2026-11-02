"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("central reúne quatro áreas e mantém operações do estoque", () => {
  const tabs = read("views/almoxarifado/_tabs.ejs");
  for (const name of ["Painel", "Solicitações", "Estoque", "Relatórios"]) {
    assert.ok(tabs.includes(name), "Aba não encontrada: " + name);
  }
  assert.doesNotMatch(tabs, /Compras a caminho|ac-subnav/);
  assert.match(read("views/almoxarifado/_stock-operations.ejs"), /Materiais separados/);
  assert.match(read("views/estoque/reservas.ejs"), /almoxarifado\/_tabs/);
});

test('central mantém filtros legados e usa quantidades físicas para agrupar solicitações', () => {
  const central=read('modules/almoxarifado/almoxarifado.solicitacoes.service.js');
  for(const status of ['PENDENTES','NAO_CHEGOU','PARCIAL','TODAS'])assert.ok(central.includes(status));
  assert.match(central,/qtd_comprada/);assert.match(central,/qtd_recebida_total/);
  assert.match(read('modules/almoxarifado/almoxarifado.controller.js'),/req.query.aba/);
});

test("V13 mantém QR prioritário e obriga confirmar nome no atendimento manual", () => {
  const ctrl = read("modules/almoxarifado/retiradas-qr.controller.js");
  const view = read("views/almoxarifado/retirada_qr.ejs");
  const service = read("modules/estoque/estoque.reservas.service.js");
  const routes = read("modules/almoxarifado/almoxarifado.routes.js");
  assert.match(view, /name="nome_retirante" required/);
  assert.match(view, /name="nome" required minlength="3"/);
  assert.match(view, /Cadastrar pessoa ainda não registrada/);
  assert.match(ctrl, /cadastrarColaborador/);
  assert.match(ctrl, /normNome\(pessoa.nome\)/);
  assert.match(routes, /almoxarifado_manage\), qrCtrl\.cadastrarColaborador/);
  assert.match(service, /normalizar\(nomeRetirante\) !== normalizar\(pessoa\.nome\)/);
  assert.match(service, /identificacao_origem: qrCode/);
  assert.match(read("modules/colaboradores/colaboradores.routes.js"), /qrCtrl\.emitir/);
});

test("V13 views de recebimentos, entrega e retirada compilam", () => {
  for (const name of ["views/almoxarifado/_tabs.ejs", "views/almoxarifado/recebimentos.ejs", "views/almoxarifado/retirada_qr.ejs","views/estoque/reservas.ejs"]) {
    assert.doesNotThrow(() => ejs.compile(read(name),{filename:path.join(__dirname,"..",name)}),name);
  }
});
