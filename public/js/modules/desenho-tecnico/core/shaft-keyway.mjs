export function readKeyway(input, first, bore = null) {
  if (input == null) return null;
  const { length, width, depth } = Object.fromEntries(['length', 'width', 'depth'].map((key) => [
    key, typeof input[key] === 'number' || typeof input[key] === 'string' ? Number(input[key]) : NaN,
  ]));
  if (![length, width, depth].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Chaveta: informe comprimento, largura e profundidade maiores que zero.');
  }
  if (!first || length > first.length) {
    throw new Error('Chaveta: o comprimento deve caber no primeiro trecho, a partir da face inicial.');
  }
  const radius = first.diameter / 2;
  const floor = radius - depth;
  if (floor <= 0 || Math.hypot(width / 2, floor) >= radius) {
    throw new Error('Chaveta: reduza a largura ou ajuste a profundidade para que o rasgo caiba no diâmetro da ponta.');
  }
  if (bore && floor <= bore.diameter / 2) {
    throw new Error('Chaveta: a profundidade do rasgo alcança o alojamento axial.');
  }
  return { length, width, depth };
}

export function keywayPlan({ keyway, origin = { x: 0, y: 0 }, orientation }) {
  if (!keyway) return [];
  const half = keyway.width / 2;
  return [[0, -half], [keyway.length, -half], [keyway.length, half], [0, half]]
    .map(([along, across]) => orientation === 'vertical'
      ? { x: origin.x + across, y: origin.y + along }
      : { x: origin.x + along, y: origin.y + across });
}

export function keywayLabel({ length, width, depth }) {
  const fmt = value => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return `Chaveta ${fmt(length)} × ${fmt(width)} · prof. ${fmt(depth)} mm`;
}
