"use strict";

function montarFaixasRecebimento(painel = {}) {
  const quantidade = (valor) => {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
  };
  const comprados = quantidade(painel.pedidosComprados);
  const pendentes = Math.min(comprados, quantidade(painel.aguardandoRecebimento));
  const parciais = Math.min(pendentes, quantidade(painel.recebidosParcialmente));
  return [
    { rotulo: "Totalmente recebidos", total: comprados - pendentes },
    { rotulo: "Parcialmente recebidos", total: parciais },
    { rotulo: "Aguardando chegada", total: pendentes - parciais },
  ];
}

module.exports = { montarFaixasRecebimento };
