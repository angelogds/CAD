import { Jsep } from '../vendor/jsep-1.4.0/jsep.mjs';

// Preserve explicit parentheses so mathematical powers can bind before unary
// signs without changing the meaning of an explicitly negative base: (-2)^2.
class CalculatorParser extends Jsep {
  gobbleGroup() {
    const node = super.gobbleGroup();
    if (node) node.parenthesized = true;
    return node;
  }
}

const DEG = Math.PI / 180;
const FUNCTIONS = new Map([
  ['sqrt', [1, 1, Math.sqrt]], ['abs', [1, 1, Math.abs]],
  ['sin', [1, 1, (x) => Math.sin(x * DEG)]], ['cos', [1, 1, (x) => Math.cos(x * DEG)]],
  ['tan', [1, 1, (x) => { if (Math.abs(Math.cos(x * DEG)) < 1e-12) throw new Error('Tangente indefinida nesse ângulo.'); return Math.tan(x * DEG); }]],
  ['asin', [1, 1, (x) => Math.asin(x) / DEG]], ['acos', [1, 1, (x) => Math.acos(x) / DEG]],
  ['atan', [1, 1, (x) => Math.atan(x) / DEG]],
  ['round', [1, 1, Math.round]], ['floor', [1, 1, Math.floor]], ['ceil', [1, 1, Math.ceil]],
  ['min', [2, 16, Math.min]], ['max', [2, 16, Math.max]],
]);
const LENGTH_UNITS = new Map([['mm', 1], ['cm', 10], ['m', 1000], ['in', 25.4], ['ft', 304.8]]);

function checked(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e15) {
    throw new Error('O resultado precisa ser um número finito entre −10¹⁵ e 10¹⁵.');
  }
  return Object.is(value, -0) ? 0 : value;
}

export function calculateExpression(expression, answer = 0) {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > 256) {
    throw new Error('Informe uma expressão com até 256 caracteres.');
  }
  const normalized = expression.trim().toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2').replace(/;/g, ',').replace(/\^/g, '**').replace(/π/g, 'pi')
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  let tree;
  try { tree = new CalculatorParser(normalized).parse(); } catch { throw new Error('Expressão inválida. Confira números, operadores e parênteses.'); }
  let visited = 0;
  const evaluate = (node, depth = 0) => {
    if (!node || ++visited > 128 || depth > 24) throw new Error('Simplifique a expressão.');
    const next = (child) => evaluate(child, depth + 1);
    if (node.type === 'Literal') return checked(node.value);
    if (node.type === 'Identifier') {
      if (node.name === 'pi') return Math.PI;
      if (node.name === 'e') return Math.E;
      if (node.name === 'ans') return checked(answer);
      throw new Error('Use pi, e ou ans para constantes e o último resultado.');
    }
    if (node.type === 'UnaryExpression' && ['+', '-'].includes(node.operator)) {
      return checked(node.operator === '-' ? -next(node.argument) : next(node.argument));
    }
    if (node.type === 'BinaryExpression' && ['+', '-', '*', '/', '%', '**'].includes(node.operator)) {
      if (node.operator === '**') {
        let base = node.left, sign = 1;
        while (base.type === 'UnaryExpression' && !base.parenthesized && ['+', '-'].includes(base.operator)) {
          if (base.operator === '-') sign *= -1;
          base = base.argument;
        }
        return checked(sign * next(base) ** next(node.right));
      }
      const a = next(node.left), b = next(node.right);
      if (['/', '%'].includes(node.operator) && b === 0) throw new Error('Não é possível dividir por zero.');
      switch (node.operator) {
        case '+': return checked(a + b);
        case '-': return checked(a - b);
        case '*': return checked(a * b);
        case '/': return checked(a / b);
        case '%': return checked(a % b);
      }
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
      const spec = FUNCTIONS.get(node.callee.name);
      if (!spec) throw new Error('Função não disponível. Use as funções indicadas na calculadora.');
      const [min, max, operation] = spec;
      if (node.arguments.length < min || node.arguments.length > max) {
        throw new Error('Quantidade de argumentos inválida. Use ; entre argumentos.');
      }
      return checked(operation(...node.arguments.map(next)));
    }
    throw new Error('Use somente números, funções e operadores aritméticos.');
  };
  return evaluate(tree);
}

export function convertLength(value, from = 'mm', to = 'mm') {
  if (!LENGTH_UNITS.has(from) || !LENGTH_UNITS.has(to)) throw new Error('Unidade de comprimento inválida.');
  return checked(checked(value) * LENGTH_UNITS.get(from) / LENGTH_UNITS.get(to));
}

export function formatCalculatorValue(value) {
  return String(Number(checked(value).toPrecision(12)));
}

export function selectionMeasurements(entities = []) {
  if (entities.length !== 1) return [];
  const entity = entities[0], g = entity.geometry || entity;
  const result = [];
  const add = (label, value) => { if (Number.isFinite(value) && value >= 0) result.push({ label, value, unit: 'mm' }); };
  if (['line', 'centerline'].includes(entity.type)) add('Comprimento', Math.hypot(g.x2 - g.x1, g.y2 - g.y1));
  if (entity.type === 'circle') {
    add('Raio', g.radius); add('Diâmetro', g.radius * 2); add('Circunferência', 2 * Math.PI * g.radius);
  }
  if (entity.type === 'rect') {
    add('Largura', Math.abs(g.width)); add('Altura', Math.abs(g.height));
    add('Perímetro', 2 * (Math.abs(g.width) + Math.abs(g.height)));
  }
  if (entity.type === 'polyline' && Array.isArray(g.points) && g.points.length > 1) {
    let total = g.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - g.points[index].x, point.y - g.points[index].y), 0);
    if (g.closed) total += Math.hypot(g.points.at(-1).x - g.points[0].x, g.points.at(-1).y - g.points[0].y);
    add('Comprimento do contorno', total);
  }
  if (entity.type === 'shaft' && Array.isArray(g.segments) && g.segments.length) {
    add('Comprimento total', g.segments.reduce((sum, segment) => sum + Number(segment.length), 0));
    add('Diâmetro máximo', Math.max(...g.segments.map((segment) => Number(segment.diameter))));
  }
  return result;
}
