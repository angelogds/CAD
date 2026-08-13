const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCentavos, subtotalCentavos, totais, progresso, statusRecebimento } = require('../modules/compras/compras.calculos');

test('4 x R$ 80,00 = R$ 320,00', () => assert.equal(subtotalCentavos(4, parseCentavos('80,00')), 32000));
test('2 x R$ 160,00 = R$ 320,00', () => assert.equal(subtotalCentavos(2, parseCentavos('160,00')), 32000));
test('soma subtotais e aplica frete/desconto em centavos', () => assert.deepEqual(totais([{ quantidade:4, valorUnitarioCentavos:8000 },{ quantidade:2, valorUnitarioCentavos:16000 }],1000,500),{subtotalCentavos:64000,totalCentavos:64500}));
test('aceita moeda brasileira com milhar', () => assert.equal(parseCentavos('2.300,45'),230045));
test('bloqueia valor negativo', () => assert.throws(()=>parseCentavos('-0,01'),/negativo/));
test('bloqueia desconto que torna total negativo', () => assert.throws(()=>totais([{quantidade:1,valorUnitarioCentavos:100}],0,101),/negativo/));
test('3 itens cotados em 4 = 75%', () => assert.equal(progresso(3,4),75));
test('solicitação sem itens tem progresso zero', () => assert.equal(progresso(0,0),0));
test('recebimento 2 de 4 é parcial', () => assert.equal(statusRecebimento(2,4),'RECEBIDO_PARCIALMENTE'));
test('recebimento 4 de 4 é total', () => assert.equal(statusRecebimento(4,4),'RECEBIDO'));
