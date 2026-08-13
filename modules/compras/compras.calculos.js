'use strict';

function parseCentavos(value, field = 'Valor') {
  if (Number.isInteger(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} inválido ou negativo.`);
  return Math.round(number * 100);
}

function subtotalCentavos(quantidade, unitarioCentavos) {
  const qtd = Number(quantidade);
  if (!Number.isFinite(qtd) || qtd < 0) throw new Error('Quantidade inválida ou negativa.');
  if (!Number.isInteger(unitarioCentavos) || unitarioCentavos < 0) throw new Error('Valor unitário inválido.');
  return Math.round(qtd * unitarioCentavos);
}

function totais(itens, freteCentavos = 0, descontoCentavos = 0) {
  const subtotal = itens.reduce((sum, item) => sum + subtotalCentavos(item.quantidade, item.valorUnitarioCentavos), 0);
  const total = subtotal + freteCentavos - descontoCentavos;
  if (total < 0) throw new Error('O desconto não pode tornar o total geral negativo.');
  return { subtotalCentavos: subtotal, totalCentavos: total };
}

function progresso(cotados, total) { return total > 0 ? Math.round((cotados / total) * 100) : 0; }
function statusRecebimento(recebida, comprada) {
  if (recebida <= 0) return 'AGUARDANDO_ENTREGA';
  if (recebida < comprada) return 'RECEBIDO_PARCIALMENTE';
  return 'RECEBIDO';
}

module.exports = { parseCentavos, subtotalCentavos, totais, progresso, statusRecebimento };
