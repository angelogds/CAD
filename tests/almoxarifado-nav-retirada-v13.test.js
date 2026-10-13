"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("V13 tem somente seis abas operacionais e mantém fila de entrega", () => {
  const tabs = read("views/almoxarifado/_tabs.ejs");
  for (const name of ["Painel", "Compras a receber", "Para entregar", "Estoque", "Retirada", "Visão gerencial"]) {
    assert.ok(tabs.includes(name), "Aba não encontrada: " + name);
  }
  assert.doesNotMatch(tabs, /Compras a caminho/);
  assert.match(read("views/estoque/reservas.ejs"), /almoxarifado\/_tabs/);
});

test("V13 separa compras não recebidas, parciais e totalmente recebidas pelas quantidades", () => {
  const ctrl = read("modules/almoxarifado/almoxarifado.controller.js");
  const page = read("views/almoxarifado/recebimentos.ejs");
  for (const status of ["PENDENTES","NAO_CHEGOU","PARCIAL","TOTAL","TODAS"]) {
    assert.ok(ctrl.includes(status) && page.includes(status));
  }
  assert.match(ctrl, /qtd_pendente_total/);
  assert.match(ctrl, /qtd_recebida_total_agregada/);
  assert.doesNotMatch(page, /Compras a caminho/);
});

test("V13 mantém QR prioritário e obriga confirmar nome no atendimento manual", () => {
  const ctrl = read("modules/almoxarifado/retiradas-qr.controller.js");
  const view = read("views/almoxarifado/retirada_qr.ejs");
  const service = read("modules/estoque/estoque.reservas.service.js");
  const routes = read("modules/almoxarifado/almoxarifado.routes.js");
  assert.match(view, /name="nome_retirante" required/);
  assert.match(view, /name="nome" minlength="3"/);
  assert.match(view, /Cadastrar pessoa sem cartão QR/);
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
