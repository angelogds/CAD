"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { montarFaixasRecebimento } = require("../modules/almoxarifado/almoxarifado.grafico");

function totais(painel) {
  const faixas = montarFaixasRecebimento(painel);
  assert.deepEqual(faixas.map(f => f.rotulo), [
    "Totalmente recebidos", "Parcialmente recebidos", "Aguardando chegada"
  ]);
  return faixas.map(f => f.total);
}

test("gráfico de recebimentos vazio apresenta três faixas zeradas", () => {
  assert.deepEqual(totais({}), [0, 0, 0]);
});

test("pedido comprado ainda não recebido aparece em aguardando chegada", () => {
  assert.deepEqual(totais({ pedidosComprados: 1, aguardandoRecebimento: 1, recebidosParcialmente: 0 }), [0, 0, 1]);
});

test("pedido parcialmente recebido aparece só na faixa parcial", () => {
  assert.deepEqual(totais({ pedidosComprados: 1, aguardandoRecebimento: 1, recebidosParcialmente: 1 }), [0, 1, 0]);
});

test("pedido integralmente recebido aparece só na faixa concluída", () => {
  assert.deepEqual(totais({ pedidosComprados: 1, aguardandoRecebimento: 0, recebidosParcialmente: 0 }), [1, 0, 0]);
});

test("contagem mista soma o total de pedidos sem duplicá-los", () => {
  const resultado = totais({ pedidosComprados: 6, aguardandoRecebimento: 4, recebidosParcialmente: 2 });
  assert.deepEqual(resultado, [2, 2, 2]);
  assert.equal(resultado.reduce((s, n) => s + n, 0), 6);
});

test("dados inválidos não criam faixas negativas nem NaN", () => {
  assert.deepEqual(totais({ pedidosComprados: "2", aguardandoRecebimento: 3, recebidosParcialmente: 8 }), [0, 2, 0]);
  assert.deepEqual(totais({ pedidosComprados: "abc", aguardandoRecebimento: -1, recebidosParcialmente: Infinity }), [0, 0, 0]);
});
