'use strict';

const POINTS_PER_MM = 72 / 25.4;
const PAPER_FORMATS = Object.freeze({
  A4: Object.freeze({ format: 'A4', widthMm: 297, heightMm: 210 }),
  A3: Object.freeze({ format: 'A3', widthMm: 420, heightMm: 297 }),
});

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finitePositive(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeDenominator(input = {}) {
  const direct = finitePositive(input.denominator);
  if (direct) return Math.max(0.01, Math.min(100000, direct));

  const match = String(input.scale || '').trim().match(/^1\s*:\s*([0-9]+(?:[.,][0-9]+)?)$/i);
  if (!match) return null;
  const parsed = finitePositive(match[1].replace(',', '.'));
  return parsed ? Math.max(0.01, Math.min(100000, parsed)) : null;
}

function formatScaleNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  if (Number.isInteger(number)) return String(number);
  return String(Number(number.toFixed(4)));
}

function normalizePaperLayout(input) {
  const source = plainObject(input);
  const format = String(source.format || '').trim().toUpperCase();
  const spec = PAPER_FORMATS[format];
  const denominator = normalizeDenominator(source);
  if (!spec || !denominator) return null;

  const generatedAt = String(source.generatedAt || '').trim();
  return {
    format: spec.format,
    name: `FAB-${spec.format}`,
    scale: `1:${formatScaleNumber(denominator)}`,
    denominator,
    generatedAt: generatedAt.slice(0, 64),
  };
}

function sanitizeManufacturing(input) {
  const source = plainObject(input);
  const paperLayout = normalizePaperLayout(source.paperLayout);
  return paperLayout ? { paperLayout } : {};
}

function resolvePaperConfig(cadData = {}) {
  const paperLayout = normalizePaperLayout(cadData?.manufacturing?.paperLayout);
  const format = paperLayout?.format || 'A4';
  const spec = PAPER_FORMATS[format] || PAPER_FORMATS.A4;
  const unit = String(cadData?.unidade || 'mm').trim() || 'mm';
  return {
    format: spec.format,
    pdfSize: spec.format,
    orientation: 'landscape',
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
    unit,
    paperLayout,
    denominator: paperLayout?.denominator || null,
    scaleLabel: paperLayout?.scale || 'AJUSTAR',
    trueScale: Boolean(paperLayout),
  };
}

function computePlotTransform(bounds, area, paperLayout = null) {
  const minX = Number(bounds?.minX);
  const minY = Number(bounds?.minY);
  const maxX = Number(bounds?.maxX);
  const maxY = Number(bounds?.maxY);
  const width = Number(area?.width);
  const height = Number(area?.height);
  const x = Number(area?.x);
  const y = Number(area?.y);
  if (![minX, minY, maxX, maxY, width, height, x, y].every(Number.isFinite)) return null;

  const contentWidth = Math.max(1e-9, maxX - minX);
  const contentHeight = Math.max(1e-9, maxY - minY);
  const normalizedLayout = normalizePaperLayout(paperLayout);

  if (normalizedLayout) {
    const scale = POINTS_PER_MM / normalizedLayout.denominator;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return {
      scale,
      offsetX: x + width / 2 - centerX * scale,
      offsetY: y + height / 2 - centerY * scale,
      mode: 'true-scale',
      denominator: normalizedLayout.denominator,
    };
  }

  const scaleX = (width - 60) / contentWidth;
  const scaleY = (height - 60) / contentHeight;
  const scale = Math.min(scaleX, scaleY, 1.5);
  return {
    scale,
    offsetX: x + 30 - minX * scale,
    offsetY: y + 30 - minY * scale,
    mode: 'legacy-fit',
    denominator: null,
  };
}

module.exports = {
  POINTS_PER_MM,
  PAPER_FORMATS,
  normalizePaperLayout,
  sanitizeManufacturing,
  resolvePaperConfig,
  computePlotTransform,
};