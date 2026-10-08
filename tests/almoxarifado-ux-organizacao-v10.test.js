"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const source=p=>fs.readFileSync(path.join(root,p),"utf8");

test("abas do almoxarifado têm rótulos sem símbolos e navegação acessível",()=>{
  const partial=source("views/almoxarifado/_tabs.ejs");
  for(const label of ["Painel","Compras a caminho","Compras a receber","Para entregar","Estoque","Retirada","Visão gerencial"]){
    assert.ok(partial.includes(label),`Falta aba: ${label}`);
  }
  assert.doesNotMatch(partial,/<span aria-hidden=/);
  assert.match(partial,/aria-current="page"/);
  assert.match(partial,/aria-label="Navegação do Almoxarifado"/);
});

test("todas as sete telas carregam a identidade visual compartilhada V10",()=>{
  for(const page of ["index","recebimentos","conferir","estoque","inventario_armazem_fardo","retirada_qr","gerencial"]){
    const view=source(`views/almoxarifado/${page}.ejs`);
    assert.match(view,/\/css\/almoxarifado-ux-v10\.css/,`CSS V10 ausente: ${page}`);
    assert.match(view,/include\('_tabs'/,`Abas ausentes: ${page}`);
  }
  const css=source("public/css/almoxarifado-ux-v10.css");
  assert.match(css,/\.almox-tabs--operacional \.almox-tab/);
  assert.match(css,/border-radius:8px/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media\(max-width:800px\)/);
});

test("organização do estoque mantém ações originais e permite localizar sem endereço",()=>{
  const view=source("views/almoxarifado/estoque.ejs");
  const ctrl=source("modules/almoxarifado/almoxarifado.controller.js");
  for(const key of ["SEM_ENDERECO","ABAIXO_MINIMO","RESERVADO"]){
    assert.ok(view.includes(key));
    assert.ok(ctrl.includes(key));
  }
  for(const key of ["NOME","LOCAL","CATEGORIA","SALDO"]){
    assert.ok(view.includes(key));
    assert.ok(ctrl.includes(key));
  }
  assert.match(view,/data-stock-classifier/);
  assert.match(view,/Salvar organização/);
  assert.match(view,/\/estoque\/saidas\/nova\?contexto=almoxarifado/);
  assert.match(view,/retorno_situacao/);
  assert.match(ctrl,/estoqueComDisponivel\(estoqueService\.listItens\(filtros\)\)/);
  assert.match(ctrl,/canWithdraw: canWithdrawStock/);
});
