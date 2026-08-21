import { AcApDocManager } from '@mlightcad/cad-simple-viewer';
import {
  AcDbCircle,
  AcDbEllipse,
  AcDbLayerTableRecord,
  AcDbLayoutManager,
  AcDbLine,
  AcDbMText,
  AcDbPolyline,
  AcDbViewport,
  AcGePoint2d,
  AcGePoint3d
} from '@mlightcad/data-model';

const VIEW_LAYER = 'FAB_VISTAS_PROJETADAS';
const PAPER_LAYOUT_PREFIX = 'FAB-';
const GENERATED_PREFIX = 'FAB_';
const EPS = 1e-6;
const STANDARD_SCALES = [1, 2, 2.5, 5, 10, 20, 25, 50, 100];

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).replace(/[\r\n]+/g, ' ').trim();
}

function getDb() {
  const database = AcApDocManager.instance?.curDocument?.database;
  if (!database) throw new Error('Documento MLightCAD não está disponível.');
  return database;
}

function getModel() {
  return getDb().tables.blockTable.modelSpace;
}

function ensureLayer(name) {
  const table = getDb().tables.layerTable;
  if (!table.getAt(name)) table.add(new AcDbLayerTableRecord({ name }));
  return name;
}

function applyLayer(entity, layer) {
  ensureLayer(layer);
  entity.layer = layer;
  return entity;
}

function appendModelLine(a, b, layer = VIEW_LAYER) {
  const entity = applyLayer(new AcDbLine(
    { x: asNumber(a.x), y: asNumber(a.y), z: 0 },
    { x: asNumber(b.x), y: asNumber(b.y), z: 0 }
  ), layer);
  getModel().appendEntity(entity);
  return entity;
}

function appendModelCircle(center, radius, layer = VIEW_LAYER) {
  const entity = applyLayer(new AcDbCircle(
    { x: asNumber(center.x), y: asNumber(center.y), z: 0 },
    Math.abs(asNumber(radius))
  ), layer);
  getModel().appendEntity(entity);
  return entity;
}

function appendModelRect(x, y, width, height, layer = VIEW_LAYER) {
  const poly = applyLayer(new AcDbPolyline(), layer);
  const pts = [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }
  ];
  pts.forEach((point, index) => poly.addVertexAt(index, new AcGePoint2d(point.x, point.y)));
  poly.closed = true;
  getModel().appendEntity(poly);
  return poly;
}

function appendModelText(text, x, y, height = 3.2, width = 80, layer = VIEW_LAYER) {
  const entity = applyLayer(new AcDbMText(), layer);
  entity.location = { x, y, z: 0 };
  entity.contents = cleanText(text);
  entity.height = Math.max(1, asNumber(height, 3.2));
  entity.width = Math.max(entity.height * 2, asNumber(width, 80));
  entity.lineSpacingFactor = 1;
  getModel().appendEntity(entity);
  return entity;
}

function appendPaperLine(btr, a, b) {
  const entity = new AcDbLine(
    { x: asNumber(a.x), y: asNumber(a.y), z: 0 },
    { x: asNumber(b.x), y: asNumber(b.y), z: 0 }
  );
  btr.appendEntity(entity);
  return entity;
}

function appendPaperRect(btr, x, y, width, height) {
  const poly = new AcDbPolyline();
  const pts = [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }
  ];
  pts.forEach((point, index) => poly.addVertexAt(index, new AcGePoint2d(point.x, point.y)));
  poly.closed = true;
  btr.appendEntity(poly);
  return poly;
}

function appendPaperText(btr, text, x, y, height = 3, width = 90) {
  const entity = new AcDbMText();
  entity.location = { x, y, z: 0 };
  entity.contents = cleanText(text);
  entity.height = Math.max(1, height);
  entity.width = Math.max(10, width);
  entity.lineSpacingFactor = 1;
  btr.appendEntity(entity);
  return entity;
}

function polylinePoints(entity) {
  return Array.from({ length: entity.numberOfVertices || 0 }, (_, index) => {
    const point = entity.getPoint2dAt(index);
    return { x: point.x, y: point.y };
  });
}

function boundsFromPoints(points) {
  if (!points.length) return null;
  const xs = points.map((p) => asNumber(p.x));
  const ys = points.map((p) => asNumber(p.y));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX, maxX, minY, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function entityBounds(entity) {
  const layer = String(entity?.layer || '');
  if (layer.startsWith(GENERATED_PREFIX) || layer === VIEW_LAYER) return null;
  if (entity instanceof AcDbLine) {
    return boundsFromPoints([entity.startPoint, entity.endPoint]);
  }
  if (entity instanceof AcDbCircle) {
    const r = Math.abs(entity.radius);
    return { minX: entity.center.x - r, maxX: entity.center.x + r, minY: entity.center.y - r, maxY: entity.center.y + r, width: r * 2, height: r * 2, centerX: entity.center.x, centerY: entity.center.y };
  }
  if (entity instanceof AcDbEllipse) {
    const axis = entity.majorAxis || { x: 1, y: 0 };
    const rotation = Math.atan2(axis.y, axis.x);
    const major = Math.abs(entity.majorRadius);
    const minor = Math.abs(entity.minorRadius);
    const ex = Math.sqrt((major * Math.cos(rotation)) ** 2 + (minor * Math.sin(rotation)) ** 2);
    const ey = Math.sqrt((major * Math.sin(rotation)) ** 2 + (minor * Math.cos(rotation)) ** 2);
    return { minX: entity.center.x - ex, maxX: entity.center.x + ex, minY: entity.center.y - ey, maxY: entity.center.y + ey, width: ex * 2, height: ey * 2, centerX: entity.center.x, centerY: entity.center.y };
  }
  if (entity instanceof AcDbPolyline) {
    return boundsFromPoints(polylinePoints(entity));
  }
  return null;
}

function modelBounds() {
  const boxes = [];
  for (const entity of getModel().newIterator()) {
    const box = entityBounds(entity);
    if (box) boxes.push(box);
  }
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.minX));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

function clearModelLayer(layerName) {
  const view = AcApDocManager.instance.curView;
  let count = 0;
  for (const entity of [...getModel().newIterator()]) {
    if (String(entity.layer || '') !== layerName) continue;
    try { entity.erase(); } catch (_error) {}
    try { view?.removeEntity(entity); } catch (_error) {}
    count += 1;
  }
  return count;
}

function rectDescriptor(entity) {
  if (!(entity instanceof AcDbPolyline) || !entity.closed || entity.numberOfVertices !== 4) return null;
  const points = polylinePoints(entity);
  const box = boundsFromPoints(points);
  if (!box || box.width <= EPS || box.height <= EPS) return null;
  const tolerance = Math.max(0.01, Math.max(box.width, box.height) * 0.001);
  const axisAligned = points.every((p) => {
    const onX = Math.abs(p.x - box.minX) <= tolerance || Math.abs(p.x - box.maxX) <= tolerance;
    const onY = Math.abs(p.y - box.minY) <= tolerance || Math.abs(p.y - box.maxY) <= tolerance;
    return onX && onY;
  });
  return axisAligned ? { ...box, entity } : null;
}

function describeModel() {
  const circles = [];
  const rects = [];
  for (const entity of getModel().newIterator()) {
    if (String(entity.layer || '').startsWith(GENERATED_PREFIX)) continue;
    if (entity instanceof AcDbCircle) circles.push({ entity, center: { x: entity.center.x, y: entity.center.y }, radius: Math.abs(entity.radius) });
    const rect = rectDescriptor(entity);
    if (rect) rects.push(rect);
  }
  return { circles, rects };
}

function detectSteppedShaft(desc) {
  if (desc.rects.length < 2) return null;
  const sorted = [...desc.rects].sort((a, b) => a.minX - b.minX);
  const medianY = sorted.reduce((sum, r) => sum + r.centerY, 0) / sorted.length;
  const aligned = sorted.filter((r) => Math.abs(r.centerY - medianY) <= Math.max(0.5, r.height * 0.02));
  if (aligned.length < 2) return null;
  for (let i = 1; i < aligned.length; i += 1) {
    if (Math.abs(aligned[i].minX - aligned[i - 1].maxX) > Math.max(0.8, aligned[i].width * 0.01)) return null;
  }
  return {
    rects: aligned,
    centerY: medianY,
    minX: aligned[0].minX,
    maxX: aligned[aligned.length - 1].maxX,
    firstDiameter: aligned[0].height,
    maxDiameter: Math.max(...aligned.map((r) => r.height))
  };
}

function detectRoundPart(desc) {
  if (!desc.circles.length) return null;
  const outer = [...desc.circles].sort((a, b) => b.radius - a.radius)[0];
  const diameter = outer.radius * 2;
  const tolerance = Math.max(0.5, diameter * 0.015);
  const concentric = desc.circles
    .filter((c) => c !== outer && Math.hypot(c.center.x - outer.center.x, c.center.y - outer.center.y) <= tolerance)
    .sort((a, b) => b.radius - a.radius);
  const bore = concentric[0] || null;
  const side = desc.rects.find((r) => Math.abs(r.height - diameter) <= tolerance && r.width > EPS && r.width <= diameter * 0.6);
  if (!side) return null;
  const holes = desc.circles.filter((c) => {
    if (c === outer || c === bore) return false;
    const d = Math.hypot(c.center.x - outer.center.x, c.center.y - outer.center.y);
    return d > tolerance && d + c.radius < outer.radius + tolerance;
  });
  return { outer, bore, side, holes, diameter, thickness: side.width, kind: holes.length >= 3 ? 'flange' : 'disc' };
}

function hatchRect(x, y, width, height, spacing = 8) {
  const step = Math.max(3, spacing);
  const min = -height;
  const max = width;
  for (let d = min; d <= max; d += step) {
    const x1 = x + Math.max(0, d);
    const y1 = y + Math.max(0, -d);
    const x2 = x + Math.min(width, d + height);
    const y2 = y + Math.min(height, height + d);
    if (Math.hypot(x2 - x1, y2 - y1) > EPS) appendModelLine({ x: x1, y: y1 }, { x: x2, y: y2 }, VIEW_LAYER);
  }
}

function generateProjectedViews(onStatus = () => {}) {
  clearModelLayer(VIEW_LAYER);
  ensureLayer(VIEW_LAYER);
  const desc = describeModel();
  const bounds = modelBounds();
  if (!bounds) throw new Error('Não há geometria de peça para gerar vistas.');
  const shaft = detectSteppedShaft(desc);
  if (shaft) {
    const radius = shaft.firstDiameter / 2;
    const center = { x: shaft.maxX + Math.max(35, shaft.maxDiameter * 0.9), y: shaft.centerY };
    appendModelCircle(center, radius);
    appendModelLine({ x: center.x - radius * 1.25, y: center.y }, { x: center.x + radius * 1.25, y: center.y });
    appendModelLine({ x: center.x, y: center.y - radius * 1.25 }, { x: center.x, y: center.y + radius * 1.25 });
    appendModelText('VISTA DE EXTREMIDADE', center.x - radius, center.y - radius - 10, 3.2, Math.max(60, radius * 2));
    try { AcApDocManager.instance.curView.zoomToFitDrawing(); } catch (_error) {}
    onStatus('Vista projetada de extremidade do eixo gerada automaticamente.');
    return { count: 4, kind: 'shaft' };
  }

  const round = detectRoundPart(desc);
  if (round) {
    const gap = Math.max(30, round.diameter * 0.18);
    const x = Math.max(bounds.maxX, round.side.maxX) + gap;
    const y = round.outer.center.y - round.diameter / 2;
    const bore = round.bore ? round.bore.radius * 2 : 0;
    let count = 0;
    if (bore > EPS && bore < round.diameter) {
      const materialHeight = (round.diameter - bore) / 2;
      appendModelRect(x, y, round.thickness, materialHeight); count += 1;
      appendModelRect(x, round.outer.center.y + bore / 2, round.thickness, materialHeight); count += 1;
      hatchRect(x, y, round.thickness, materialHeight, Math.max(4, round.thickness * 0.35));
      hatchRect(x, round.outer.center.y + bore / 2, round.thickness, materialHeight, Math.max(4, round.thickness * 0.35));
    } else {
      appendModelRect(x, y, round.thickness, round.diameter); count += 1;
      hatchRect(x, y, round.thickness, round.diameter, Math.max(4, round.thickness * 0.35));
    }
    appendModelLine({ x: x - 5, y: round.outer.center.y }, { x: x + round.thickness + 5, y: round.outer.center.y }); count += 1;
    appendModelText('CORTE A-A', x - 2, y - 10, 3.2, Math.max(50, round.thickness + 20)); count += 1;
    try { AcApDocManager.instance.curView.zoomToFitDrawing(); } catch (_error) {}
    onStatus(`${round.kind === 'flange' ? 'Flange' : 'Disco'} reconhecido: corte A-A gerado automaticamente.`);
    return { count, kind: round.kind };
  }

  onStatus('VISTAS AUTO: peça não reconhecida como eixo, flange ou disco paramétrico.');
  return { count: 0, kind: 'unknown' };
}

function formatSpec(format) {
  return String(format || '').toUpperCase() === 'A4'
    ? { name: 'A4', width: 297, height: 210 }
    : { name: 'A3', width: 420, height: 297 };
}

function chooseScale(bounds, viewportWidth, viewportHeight, requested) {
  const token = String(requested || 'AUTO').trim().toUpperCase().replace('1:', '');
  if (token !== 'AUTO') {
    const value = asNumber(token, 0);
    if (value > 0) return value;
  }
  const needed = Math.max(bounds.width / Math.max(1, viewportWidth * 0.9), bounds.height / Math.max(1, viewportHeight * 0.9), 1);
  return STANDARD_SCALES.find((scale) => scale >= needed) || STANDARD_SCALES[STANDARD_SCALES.length - 1];
}

function getLayoutBtr(layout) {
  return getDb().tables.blockTable.getIdAt(layout.blockTableRecordId);
}

function clearPaperBlock(btr) {
  if (!btr) return;
  for (const entity of [...btr.newIterator()]) {
    try { entity.erase(); } catch (_error) {}
  }
}

function createOrUpdatePaperLayout(cadData = {}, { format = 'A3', scale = 'AUTO' } = {}, onStatus = () => {}) {
  const bounds = modelBounds();
  if (!bounds) throw new Error('Crie ou importe uma peça antes de gerar o Layout.');
  const db = getDb();
  const manager = new AcDbLayoutManager();
  const spec = formatSpec(format);
  const name = `${PAPER_LAYOUT_PREFIX}${spec.name}`;
  let layout = manager.findLayoutNamed(name, db);
  let btr = layout ? getLayoutBtr(layout) : null;
  if (!layout || !btr) {
    const created = manager.createLayout(name, db);
    layout = created.layout;
    btr = created.btr;
    layout.blockTableRecordId = btr.objectId;
    btr.layoutId = layout.objectId;
  } else {
    clearPaperBlock(btr);
  }

  layout.limits.min.copy({ x: 0, y: 0 });
  layout.limits.max.copy({ x: spec.width, y: spec.height });
  layout.extents.min.copy({ x: 0, y: 0, z: 0 });
  layout.extents.max.copy({ x: spec.width, y: spec.height, z: 0 });

  const margin = 10;
  const titleHeight = 45;
  const viewportX = margin;
  const viewportY = margin + titleHeight + 5;
  const viewportW = spec.width - margin * 2;
  const viewportH = spec.height - margin * 2 - titleHeight - 5;
  const denominator = chooseScale(bounds, viewportW, viewportH, scale);

  appendPaperRect(btr, 0, 0, spec.width, spec.height);
  appendPaperRect(btr, margin, margin, spec.width - margin * 2, spec.height - margin * 2);
  appendPaperRect(btr, spec.width - 165, margin, 155, titleHeight);
  appendPaperLine(btr, { x: spec.width - 165, y: margin + 15 }, { x: spec.width - 10, y: margin + 15 });
  appendPaperLine(btr, { x: spec.width - 165, y: margin + 30 }, { x: spec.width - 10, y: margin + 30 });
  appendPaperText(btr, 'DESENHO MECÂNICO DE FABRICAÇÃO', spec.width - 162, margin + 39, 3.4, 145);
  appendPaperText(btr, `TÍTULO: ${cleanText(cadData.titulo, 'PEÇA MECÂNICA')}`, spec.width - 162, margin + 27, 2.8, 145);
  appendPaperText(btr, `CÓDIGO: ${cleanText(cadData.codigo, 'CAD')}   |   MATERIAL: ${cleanText(cadData.material, 'A DEFINIR')}`, spec.width - 162, margin + 12, 2.6, 145);
  appendPaperText(btr, `FORMATO ${spec.name}   |   ESCALA 1:${denominator}   |   UNIDADE mm`, spec.width - 162, margin + 5, 2.7, 145);

  const viewport = new AcDbViewport();
  viewport.centerPoint = new AcGePoint3d(viewportX + viewportW / 2, viewportY + viewportH / 2, 0);
  viewport.width = viewportW;
  viewport.height = viewportH;
  viewport.viewTarget = new AcGePoint3d(bounds.centerX, bounds.centerY, 0);
  viewport.viewCenter = new AcGePoint3d(0, 0, 0);
  viewport.viewDirection = { x: 0, y: 0, z: 1 };
  viewport.viewHeight = viewportH * denominator;
  viewport.number = 2;
  viewport.status = 1;
  viewport.sheetName = name;
  btr.appendEntity(viewport);

  const manufacturing = {
    ...(cadData.manufacturing || {}),
    paperLayout: {
      format: spec.name,
      name,
      scale: `1:${denominator}`,
      denominator,
      generatedAt: new Date().toISOString()
    }
  };
  cadData.manufacturing = manufacturing;
  manager.setCurrentLayout(name, db);
  try { AcApDocManager.instance.curView.zoomToFitDrawing(); } catch (_error) {}
  onStatus(`Layout ${spec.name} criado em Paper Space na escala 1:${denominator}.`);
  return { ok: true, count: 1, manufacturing, layout: name, scale: denominator };
}

function switchLayout(name, onStatus = () => {}) {
  const db = getDb();
  const manager = new AcDbLayoutManager();
  const target = String(name || 'Model');
  if (!manager.layoutExists(target, db)) {
    onStatus(`Layout ${target} ainda não foi criado.`);
    return false;
  }
  manager.setCurrentLayout(target, db);
  try { AcApDocManager.instance.curView.zoomToFitDrawing(); } catch (_error) {}
  onStatus(target === 'Model' ? 'Model Space ativo.' : `${target} ativo.`);
  return true;
}

export function createMlightLayoutTools({ cadData = {}, onStatus = () => {} } = {}) {
  return {
    createPaperLayout: (options) => createOrUpdatePaperLayout(cadData, options, onStatus),
    generateProjectedViews: () => generateProjectedViews(onStatus),
    switchModel: () => switchLayout('Model', onStatus),
    switchA4: () => switchLayout(`${PAPER_LAYOUT_PREFIX}A4`, onStatus),
    switchA3: () => switchLayout(`${PAPER_LAYOUT_PREFIX}A3`, onStatus),
    hasLayout: (format) => new AcDbLayoutManager().layoutExists(`${PAPER_LAYOUT_PREFIX}${String(format || '').toUpperCase()}`, getDb())
  };
}
