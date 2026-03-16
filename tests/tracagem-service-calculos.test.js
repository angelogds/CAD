const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../modules/tracagem/tracagem.service');

test('rosca helicoidal: cálculo correto e unidade cm->mm', () => {
  const out = service.calcRoscaHelicoidal({ D: 10, d: 6, P: 2, unidade: 'cm', voltas: 2 });
  assert.equal(out.entrada.D, 100);
  assert.equal(out.resultado.L_ext > out.resultado.L_int, true);
  assert.ok(Math.abs(out.resultado.comprimento_total - (out.resultado.comprimento_1_volta * 2)) < 0.05);
});

test('furação flange: retorna coordenadas e valida N>=3', () => {
  const out = service.calcFuracaoFlange({ PCD: 200, N: 8, unidade: 'mm' });
  assert.equal(out.resultado.coordenadas.length, 8);
  assert.throws(() => service.calcFuracaoFlange({ PCD: 200, N: 2 }), /N deve ser inteiro maior ou igual a 3/);
});

test('curva de gomos: validações e divisões', () => {
  const out = service.calcCurvaGomos({ D: 100, R: 120, A: 90, G: 3, N: 12, unidade: 'mm' });
  assert.equal(out.planificacao.divisoes.length, 12);
  assert.equal(out.planificacao.numeroDivisoes, 12);
  assert.ok(out.planificacao.divisoes[0].altura < out.planificacao.divisoes[5].altura);
  assert.ok(Math.abs(out.planificacao.divisoes[0].altura - out.planificacao.divisoes[11].altura) < 0.25);
  assert.throws(() => service.calcCurvaGomos({ D: 100, R: 40, A: 90, G: 3, N: 12 }), /R deve ser maior/);
});

test('redução concêntrica: bloqueia D1 <= D2', () => {
  assert.throws(() => service.calcReducaoConcentrica({ D1: 100, D2: 100, h: 100 }), /módulo de cilindro/);
  const out = service.calcReducaoConcentrica({ D1: 200, D2: 100, h: 150 });
  assert.equal(out.resultado.R1, 100);
});

test('quadrado/retângulo para redondo usa true lengths sem NaN', () => {
  const out = service.calcQuadradoParaRedondo({ A: 120, B: 80, D: 100, H: 150, N: 12 });
  out.resultado.comprimentosVerdadeiros.forEach((v) => assert.equal(Number.isFinite(v), true));
  assert.equal(Number.isFinite(out.resultado.AA), true);
  assert.equal(Number.isFinite(out.resultado.AB), true);
  assert.equal(Number.isFinite(out.resultado.A1), true);
  assert.equal(Number.isFinite(out.resultado.A2), true);
  assert.equal(Number.isFinite(out.resultado.A3), true);
  assert.equal(Number.isFinite(out.resultado.A4), true);
  assert.equal(Number.isFinite(out.resultado.C), true);
  assert.equal(out.planificacao.divisoes.length, 12);
  assert.match(out.planificacao.divisoes[0].trecho, /1-2/);
  assert.throws(() => service.calcQuadradoParaRedondo({ A: 120, B: 80, D: 100, H: 150, N: 3 }), /N deve ser inteiro maior ou igual a 4/);
});

test('boca de lobo 90/45/excêntrica sem NaN', () => {
  const b90 = service.calcBocaLobo90({ D: 300, d: 150, N: 12 });
  const b45 = service.calcBocaLobo45({ D: 300, d: 150, alpha: 45, N: 12 });
  const bex = service.calcBocaLoboExcentrica({ D: 300, d: 150, C: 20, N: 12 });
  [b90, b45, bex].forEach((o) => o.resultado.pontos.forEach((p) => assert.equal(Number.isFinite(p.altura), true)));
});

test('mão francesa e validação de entrada inválida', () => {
  const out = service.calcMaoFrancesa({ A: 300, h: 400, E: 10 });
  assert.equal(out.resultado.C, 500);
  assert.throws(() => service.calcMaoFrancesa({ A: 0, h: 5 }), /medida válida/);
});


test('campos de compatibilidade para telas de traçagem', () => {
  const rosca = service.calcRoscaHelicoidal({ D: 400, d: 105, P: 360 });
  assert.equal(Number.isFinite(rosca.resultado.C1), true);
  assert.equal(Number.isFinite(rosca.resultado.T), true);

  const cil = service.calcCilindro({ D: 400, h: 200 });
  assert.equal(Number.isFinite(cil.resultado.comprimento), true);

  const curva = service.calcCurvaGomos({ D: 400, R: 500, A: 90, G: 6, N: 12 });
  assert.equal(Number.isFinite(curva.resultado.passe), true);
  assert.equal(Number.isFinite(curva.resultado.A7), true);

  const b90 = service.calcBocaLobo90({ D: 300, d: 150, N: 12 });
  assert.equal(Number.isFinite(b90.resultado.R1), true);

  const bex = service.calcBocaLoboExcentrica({ D: 300, d: 150, C: 10, N: 12 });
  assert.equal(Number.isFinite(bex.resultado.deslocamento), true);

  const qpr = service.calcQuadradoParaRedondo({ A: 120, B: 80, D: 100, H: 150, N: 12 });
  assert.equal(Number.isFinite(qpr.resultado.perimetroQuadrado), true);
  assert.equal(Number.isFinite(qpr.resultado.geratrizAproximada), true);
  assert.equal(Number.isFinite(qpr.resultado.C1), true);
  assert.equal(Number.isFinite(qpr.resultado.C4), true);
});
