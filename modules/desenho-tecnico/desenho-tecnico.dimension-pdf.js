'use strict';

const DEFAULT_COLOR = '#1d4ed8';
const DEFAULT_LINE_WIDTH = 0.65;

function finitePoint(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) return null;
  return { x: Number(value.x), y: Number(value.y) };
}

function normalizeColor(value, fallback = DEFAULT_COLOR) {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function normalizeDimensionStyle(dim = {}) {
  const source = dim.style && typeof dim.style === 'object' ? dim.style : {};
  const lineType = String(source.lineType || 'Continuous').trim() || 'Continuous';
  const lineWeight = Number(source.lineWeight);
  const lineTypeScale = Number(source.lineTypeScale);
  return {
    color: normalizeColor(source.color, DEFAULT_COLOR),
    lineType,
    lineWeight: Number.isFinite(lineWeight) ? lineWeight : null,
    lineTypeScale: Number.isFinite(lineTypeScale) && lineTypeScale > 0 ? lineTypeScale : 1,
  };
}

function lineWidthPoints(style = {}) {
  const weight = Number(style.lineWeight);
  if (!Number.isFinite(weight) || weight < 0) return DEFAULT_LINE_WIDTH;
  return Math.max(0.25, Math.min(3.5, (weight / 100) * 2.834645669));
}

function linePattern(style = {}) {
  const factor = Math.max(0.1, Number(style.lineTypeScale) || 1);
  const type = String(style.lineType || 'Continuous').trim().toUpperCase();
  const pattern = (() => {
    if (type === 'DASHED') return [6, 3];
    if (type === 'HIDDEN') return [3, 2];
    if (type === 'CENTER') return [12, 3, 3, 3];
    if (type === 'DASHDOT') return [8, 2, 1, 2];
    return null;
  })();
  return pattern?.map((value) => value * factor) || null;
}

function modelToPdf(point, scale, offsetX, offsetY) {
  return { x: point.x * scale + offsetX, y: point.y * scale + offsetY };
}

function unitVector(a, b, rotation = null) {
  const hasRotation = rotation != null && String(rotation).trim() !== '' && Number.isFinite(Number(rotation));
  if (hasRotation) {
    const angle = Number(rotation);
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.000001) return null;
  return { x: dx / length, y: dy / length };
}

function projectPointToLine(point, linePoint, unit) {
  const t = (point.x - linePoint.x) * unit.x + (point.y - linePoint.y) * unit.y;
  return { x: linePoint.x + unit.x * t, y: linePoint.y + unit.y * t };
}

function getLinearDimensionLayout(dim = {}) {
  const geometry = dim.geometry || dim;
  const p1 = finitePoint(geometry.p1);
  const p2 = finitePoint(geometry.p2);
  if (!p1 || !p2) return null;

  const hasExplicitRotation = geometry.rotation != null
    && String(geometry.rotation).trim() !== ''
    && Number.isFinite(Number(geometry.rotation));
  const useRotation = geometry.mode === 'linear' && hasExplicitRotation;
  const unit = unitVector(p1, p2, useRotation ? Number(geometry.rotation) : null);
  if (!unit) return null;
  const normal = { x: -unit.y, y: unit.x };
  const textPoint = finitePoint(geometry.textPoint);
  let linePoint = finitePoint(geometry.dimensionLinePoint);

  // Compatibilidade com desenhos anteriores à persistência do ponto 10/20 do DXF.
  if (!linePoint) {
    const middle = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const reference = textPoint || middle;
    const offset = (reference.x - middle.x) * normal.x + (reference.y - middle.y) * normal.y;
    linePoint = { x: middle.x + normal.x * offset, y: middle.y + normal.y * offset };
  }

  const dimensionStart = projectPointToLine(p1, linePoint, unit);
  const dimensionEnd = projectPointToLine(p2, linePoint, unit);
  const resolvedTextPoint = textPoint || {
    x: (dimensionStart.x + dimensionEnd.x) / 2,
    y: (dimensionStart.y + dimensionEnd.y) / 2,
  };

  return {
    p1,
    p2,
    linePoint,
    dimensionStart,
    dimensionEnd,
    textPoint: resolvedTextPoint,
    unit,
    normal,
  };
}

function strokeStyledSegment(doc, start, end, style) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return;
  const pattern = linePattern(style);
  const width = lineWidthPoints(style);

  doc.save().strokeColor(style.color).lineWidth(width);
  if (!pattern) {
    doc.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke();
    doc.restore();
    return;
  }

  const ux = dx / length;
  const uy = dy / length;
  let cursor = 0;
  let index = 0;
  while (cursor < length - 0.001) {
    const segmentLength = Math.max(0.25, pattern[index % pattern.length]);
    const next = Math.min(length, cursor + segmentLength);
    if (index % 2 === 0) {
      doc.moveTo(start.x + ux * cursor, start.y + uy * cursor)
        .lineTo(start.x + ux * next, start.y + uy * next);
    }
    cursor = next;
    index += 1;
  }
  doc.stroke().restore();
}

function drawArrowHead(doc, x, y, directionX, directionY, color, size = 4.5) {
  const length = Math.hypot(directionX, directionY);
  if (length < 0.001) return;
  const ux = directionX / length;
  const uy = directionY / length;
  const nx = -uy;
  const ny = ux;
  const wing = size * 0.42;
  doc.save()
    .fillColor(color)
    .moveTo(x, y)
    .lineTo(x - ux * size + nx * wing, y - uy * size + ny * wing)
    .lineTo(x - ux * size - nx * wing, y - uy * size - ny * wing)
    .closePath()
    .fill()
    .restore();
}

function normalizeDimensionLabel(dim, geometry) {
  const label = geometry.label || dim.text || `${dim.value || ''}`;
  return String(label || '').replace(/[⌀⌾]/g, 'Ø');
}

function drawDimensionLabel(doc, label, x, y, style, rotation = 0, background = '#f8fafc') {
  if (!label) return;
  doc.save();
  if (Number.isFinite(Number(rotation)) && Math.abs(Number(rotation)) > 0.0001) {
    doc.rotate(-Number(rotation) * 180 / Math.PI, { origin: [x, y] });
  }
  doc.font('Helvetica').fontSize(8);
  const width = Math.max(18, doc.widthOfString(label) + 6);
  doc.rect(x - width / 2, y - 5, width, 11).fill(background);
  doc.fillColor(style.color).text(label, x - width / 2, y - 3.5, {
    width,
    align: 'center',
    lineBreak: false,
  });
  doc.restore();
}

function renderAngularDimension(doc, dim, scale, offsetX, offsetY, style, background) {
  const geometry = dim.geometry || dim;
  const vertex = finitePoint(geometry.vertex);
  if (!vertex) return;
  const radius = Math.max(1, Number(geometry.radius || 1));
  const startAngle = Number(geometry.startAngle || 0);
  const endAngle = Number(geometry.endAngle || 0);
  const startModel = { x: vertex.x + Math.cos(startAngle) * radius, y: vertex.y + Math.sin(startAngle) * radius };
  const endModel = { x: vertex.x + Math.cos(endAngle) * radius, y: vertex.y + Math.sin(endAngle) * radius };
  const vertexPdf = modelToPdf(vertex, scale, offsetX, offsetY);
  const startPdf = modelToPdf(startModel, scale, offsetX, offsetY);
  const endPdf = modelToPdf(endModel, scale, offsetX, offsetY);

  strokeStyledSegment(doc, vertexPdf, startPdf, style);
  strokeStyledSegment(doc, vertexPdf, endPdf, style);

  const steps = 32;
  let previous = startPdf;
  for (let index = 1; index <= steps; index += 1) {
    const angle = startAngle + (endAngle - startAngle) * index / steps;
    const current = modelToPdf({
      x: vertex.x + Math.cos(angle) * radius,
      y: vertex.y + Math.sin(angle) * radius,
    }, scale, offsetX, offsetY);
    strokeStyledSegment(doc, previous, current, style);
    previous = current;
  }

  const middleAngle = startAngle + (endAngle - startAngle) / 2;
  const fallbackText = {
    x: vertex.x + Math.cos(middleAngle) * (radius + 10 / Math.max(scale, 0.001)),
    y: vertex.y + Math.sin(middleAngle) * (radius + 10 / Math.max(scale, 0.001)),
  };
  const textPoint = finitePoint(geometry.textPoint) || fallbackText;
  const textPdf = modelToPdf(textPoint, scale, offsetX, offsetY);
  drawDimensionLabel(doc, normalizeDimensionLabel(dim, geometry), textPdf.x, textPdf.y, style, geometry.textRotation, background);
}

function renderDimensionToPdf(doc, dim, scale, offsetX, offsetY, options = {}) {
  const geometry = dim.geometry || dim;
  const style = normalizeDimensionStyle(dim);
  const background = options.background || '#f8fafc';

  if (geometry.mode === 'angular' && geometry.vertex) {
    renderAngularDimension(doc, dim, scale, offsetX, offsetY, style, background);
    return;
  }

  const layout = getLinearDimensionLayout(dim);
  if (!layout) return;
  const p1 = modelToPdf(layout.p1, scale, offsetX, offsetY);
  const p2 = modelToPdf(layout.p2, scale, offsetX, offsetY);
  const dimensionStart = modelToPdf(layout.dimensionStart, scale, offsetX, offsetY);
  const dimensionEnd = modelToPdf(layout.dimensionEnd, scale, offsetX, offsetY);
  const textPoint = modelToPdf(layout.textPoint, scale, offsetX, offsetY);

  const extend = (origin, end) => {
    const dx = end.x - origin.x;
    const dy = end.y - origin.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return;
    const ux = dx / length;
    const uy = dy / length;
    strokeStyledSegment(doc,
      { x: origin.x + ux * 1.5, y: origin.y + uy * 1.5 },
      { x: end.x + ux * 3, y: end.y + uy * 3 },
      style);
  };

  extend(p1, dimensionStart);
  extend(p2, dimensionEnd);
  strokeStyledSegment(doc, dimensionStart, dimensionEnd, style);

  const dx = dimensionEnd.x - dimensionStart.x;
  const dy = dimensionEnd.y - dimensionStart.y;
  drawArrowHead(doc, dimensionStart.x, dimensionStart.y, dx, dy, style.color);
  drawArrowHead(doc, dimensionEnd.x, dimensionEnd.y, -dx, -dy, style.color);
  drawDimensionLabel(
    doc,
    normalizeDimensionLabel(dim, geometry),
    textPoint.x,
    textPoint.y,
    style,
    geometry.textRotation,
    background,
  );
}

function getDimensionBounds(dim = {}) {
  const geometry = dim.geometry || dim;
  if (geometry.mode === 'angular' && geometry.vertex) {
    const vertex = finitePoint(geometry.vertex);
    const radius = Math.max(0, Number(geometry.radius || 0));
    if (!vertex) return null;
    const points = [
      { x: vertex.x - radius, y: vertex.y - radius },
      { x: vertex.x + radius, y: vertex.y + radius },
      finitePoint(geometry.textPoint),
      finitePoint(geometry.dimensionLinePoint),
    ].filter(Boolean);
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    return { minX: minX - 8, minY: minY - 8, maxX: maxX + 8, maxY: maxY + 8 };
  }

  const layout = getLinearDimensionLayout(dim);
  if (!layout) return null;
  const points = [layout.p1, layout.p2, layout.dimensionStart, layout.dimensionEnd, layout.textPoint, layout.linePoint];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX: minX - 8, minY: minY - 8, maxX: maxX + 8, maxY: maxY + 8 };
}

module.exports = {
  DEFAULT_COLOR,
  normalizeDimensionStyle,
  lineWidthPoints,
  linePattern,
  getLinearDimensionLayout,
  getDimensionBounds,
  renderDimensionToPdf,
};