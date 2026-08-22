function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeAngleDeg(value) {
  const angle = finiteNumber(value, 0) % 360;
  return angle < 0 ? angle + 360 : angle;
}

export function formatCadNumber(value, decimals = 6) {
  const number = finiteNumber(value, 0);
  const fixed = number.toFixed(Math.max(0, Math.min(8, Number(decimals) || 0)));
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function buildAbsolutePointToken(point) {
  return `${formatCadNumber(point?.x)},${formatCadNumber(point?.y)}`;
}

export function buildRelativePolarToken(distance, angleDeg) {
  const distanceValue = finiteNumber(distance, NaN);
  if (!(distanceValue > 0)) throw new Error('A distância deve ser maior que zero.');
  return `@${formatCadNumber(distanceValue)}<${formatCadNumber(normalizeAngleDeg(angleDeg))}`;
}

export function computeMeasurement(first, second) {
  const x1 = finiteNumber(first?.x);
  const y1 = finiteNumber(first?.y);
  const x2 = finiteNumber(second?.x);
  const y2 = finiteNumber(second?.y);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  const angleDeg = distance > 1e-12 ? normalizeAngleDeg(Math.atan2(dy, dx) * 180 / Math.PI) : 0;
  return { x1, y1, x2, y2, dx, dy, distance, angleDeg };
}

export function formatCursorCoordinates(point, decimals = 3) {
  const places = Math.max(0, Math.min(6, Number(decimals) || 0));
  return `X ${finiteNumber(point?.x).toFixed(places)}  Y ${finiteNumber(point?.y).toFixed(places)}`;
}
