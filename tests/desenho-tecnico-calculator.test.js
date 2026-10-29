const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const logic = import(pathToFileURL(path.join(__dirname, '../public/js/cad-calculator.logic.mjs')).href);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('calculadora respeita precedência, parênteses, potência e decimais brasileiros', async () => {
  const { calculateExpression: calc } = await logic;
  assert.equal(calc('(127 - 96) / 2'), 15.5);
  assert.equal(calc('2 + 3 * 4'), 14);
  assert.equal(calc('2^3^2'), 512);
  assert.equal(calc('-2^2'), -4);
  assert.equal(calc('(-2)^2'), 4);
  assert.equal(calc('-(-2)^2'), -4);
  assert.equal(calc('2^-3^2'), 1 / 512);
  assert.equal(calc('(-2)^-2'), 0.25);
  assert.equal(calc('12,5 + 2,5'), 15);
  assert.equal(calc('10 × 3 − 6 ÷ 2'), 27);
  assert.equal(calc('min(12,5;8) + max(10;20)'), 28);
});

test('funções trigonométricas usam graus e ans é o último resultado fornecido', async () => {
  const { calculateExpression: calc } = await logic;
  near(calc('sin(30)'), 0.5); near(calc('cos(60)'), 0.5);
  near(calc('asin(0,5)'), 30); near(calc('atan(1)'), 45);
  near(calc('pi * 2'), Math.PI * 2);
  assert.equal(calc('ans * 2 + sqrt(25)', 12.5), 30);
});

test('domínios inválidos e divisão por zero produzem erro em vez de medidas não finitas', async () => {
  const { calculateExpression: calc } = await logic;
  for (const expression of ['1/0', '1%0', 'sqrt(-1)', 'tan(90)', 'asin(2)', '10^1000', '1e999', 'min(1)', 'min(1;2;3;4;5;6;7;8;9;10;11;12;13;14;15;16;17)']) {
    assert.throws(() => calc(expression), undefined, expression);
  }
});

test('entrada não acessa propriedades, execução, atribuições ou tipos não numéricos', async () => {
  const { calculateExpression: calc } = await logic;
  for (const expression of ["globalThis.process.exit()", "constructor('return 1')()", 'ans.constructor', '[1,2]', 'true', '1 < 2', 'a = 3', '1,2;3', 'null', "'hello'", 'Math.sin(30)', 'foo(1)']) {
    assert.throws(() => calc(expression), undefined, expression);
  }
  assert.equal(globalThis.cgCalculatorSideEffect, undefined);
});

test('expressões vazias, enormes e recursão excessiva são rejeitadas', async () => {
  const { calculateExpression: calc } = await logic;
  assert.throws(() => calc(''));
  assert.throws(() => calc('1+'.repeat(130) + '1'));
  assert.throws(() => calc('sqrt('.repeat(30) + '1' + ')'.repeat(30)));
  assert.throws(() => calc('ans', Infinity));
});

test('conversão explícita mantém milímetros e permite ida e volta em polegadas', async () => {
  const { convertLength } = await logic;
  assert.equal(convertLength(1, 'in', 'mm'), 25.4);
  assert.equal(convertLength(100, 'cm', 'm'), 1);
  near(convertLength(convertLength(140, 'mm', 'in'), 'in', 'mm'), 140);
  assert.throws(() => convertLength(10, 'unknown', 'mm'));
  assert.throws(() => convertLength(Infinity, 'mm', 'cm'));
});

test('medidas usam geometria selecionada e incluem fechamento de polilinha', async () => {
  const { selectionMeasurements: measure } = await logic;
  assert.equal(measure([{ type: 'line', geometry: { x1: 0, y1: 0, x2: 3, y2: 4 } }])[0].value, 5);
  assert.deepEqual(measure([{ type: 'circle', geometry: { radius: 12.5 } }]).slice(0, 2), [
    { label: 'Raio', value: 12.5, unit: 'mm' }, { label: 'Diâmetro', value: 25, unit: 'mm' },
  ]);
  assert.equal(measure([{ type: 'polyline', geometry: { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }], closed: true } }])[0].value, 12);
  assert.deepEqual(measure([]), []);
  assert.deepEqual(measure([{ type: 'text' }]), []);
  assert.deepEqual(measure([{ type: 'circle' }, { type: 'line' }]), []);
});

test('formatação pode ser enviada à entrada CAD sem arredondar para duas casas', async () => {
  const { formatCalculatorValue } = await logic;
  assert.equal(formatCalculatorValue(15.5), '15.5');
  assert.equal(formatCalculatorValue(0.000125), '0.000125');
  assert.equal(formatCalculatorValue(-0), '0');
  assert.throws(() => formatCalculatorValue(NaN));
});
