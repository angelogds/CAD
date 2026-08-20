import {
  AcApDocManager,
  AcEdPromptPointOptions,
  AcEdPromptStatus
} from '@mlightcad/cad-simple-viewer';
import {
  AcDbAlignedDimension,
  AcDbCircle,
  AcDbDataGenerator,
  AcDbEllipse,
  AcDbLine,
  AcDbPolyline,
  AcGePoint2d
} from '@mlightcad/data-model';

const AUTO_DIM_PREFIX = '*AD';
const EPS = 1e-6;
const MAX_AUTO_DIMS = 48;

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value) {
  const n = asNumber(value);
  if (Math.abs(n - Math.round(n)) < 0.005) return String(Math.round(n));
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function p3(point) {
  return { x: asNumber(point?.x), y: asNumber(point?.y), z: asNumber(point?.z) };
}

function distance(a, b) {
  return Math.hypot(asNumber(b.x) - asNumber(a.x), asNumber(b.y) - asNumber(a.y));
}

function getDb() {
  const doc = AcApDocManager.instance?.curDocument;
  if (!doc?.database) throw new Error('Documento MLightCAD não está disponível.');
  return doc.database;
}

function getModel() {
  return getDb().tables.blockTable.modelSpace;
}

function nextAutoDimBlockName(db) {
  let max = 0;
  for (const block of db.tables.blockTable.newIterator()) {
    const name = String(block?.name || '');
    if (!name.startsWith(AUTO_DIM_PREFIX)) continue;
    const num = Number(name.slice(AUTO_DIM_PREFIX.length));
    if (Number.isInteger(num) && num > max) max = num;
  }
  return `${AUTO_DIM_PREFIX}${max + 1}`;
}

function ensureArrowBlock(db) {
  try {
    new AcDbDataGenerator(db).createArrowBlock();
  } catch (_error) {
    // Se o bloco de seta já existir, seguimos usando-o.
  }
}

function addDimension(p1, p2, dimLinePoint, label = '') {
  const db = getDb();
  ensureArrowBlock(db);
  const dim = new AcDbAlignedDimension(p3(p1), p3(p2), p3(dimLinePoint));
  dim.rotation = Math.atan2(asNumber(p2.y) - asNumber(p1.y), asNumber(p2.x) - asNumber(p1.x));
  if (label) dim.dimensionText = label;
  const blockName = nextAutoDimBlockName(db);
  db.tables.blockTable.add(dim.createDimBlock(blockName));
  dim.dimBlockId = blockName;
  db.tables.blockTable.modelSpace.appendEntity(dim);
  return dim;
}

function clearAutoDimensions() {
  const db = getDb();
  const view = AcApDocManager.instance.curView;
  const model = db.tables.blockTable.modelSpace;
  const remove = [];
  const blocks = [];
  for (const entity of model.newIterator()) {
    const blockName = typeof entity?.dimBlockId === 'string' ? entity.dimBlockId : '';
    if (!blockName.startsWith(AUTO_DIM_PREFIX)) continue;
    remove.push(entity);
    blocks.push(blockName);
  }
  for (const entity of remove) {
    try { entity.erase(); } catch (_error) {}
    try { view?.removeEntity(entity); } catch (_error) {}
  }
  for (const blockName of blocks) {
    try { db.tables.blockTable.remove(blockName); } catch (_error) {}
  }
  return remove.length;
}

function appendCircle(center, radius) {
  const entity = new AcDbCircle(p3(center), radius);
  getModel().appendEntity(entity);
  return entity;
}

function appendLine(a, b) {
  const entity = new AcDbLine(p3(a), p3(b));
  getModel().appendEntity(entity);
  return entity;
}

function appendRect(x, y, width, height) {
  const poly = new AcDbPolyline();
  const pts = [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }
  ];
  pts.forEach((point, index) => poly.addVertexAt(index, new AcGePoint2d(point.x, point.y)));
  poly.closed = true;
  getModel().appendEntity(poly);
  return poly;
}

async function acquirePoint(message) {
  const prompt = new AcEdPromptPointOptions(message);
  const result = await AcApDocManager.instance.editor.getPoint(prompt);
  return result.status === AcEdPromptStatus.OK ? result.value : null;
}

function polylinePoints(entity) {
  return Array.from({ length: entity.numberOfVertices || 0 }, (_, index) => {
    const point = entity.getPoint2dAt(index);
    return { x: point.x, y: point.y };
  });
}

function boundsFromPoints(points) {
  if (!points.length) return null;
  const xs = points.map((point) => asNumber(point.x));
  const ys = points.map((point) => asNumber(point.y));
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

function describeEntities() {
  const circles = [];
  const lines = [];
  const polylines = [];
  const ellipses = [];
  for (const entity of getModel().newIterator()) {
    if (entity instanceof AcDbCircle) {
      circles.push({ entity, center: { x: entity.center.x, y: entity.center.y }, radius: Math.abs(entity.radius) });
    } else if (entity instanceof AcDbLine) {
      lines.push({
        entity,
        a: { x: entity.startPoint.x, y: entity.startPoint.y },
        b: { x: entity.endPoint.x, y: entity.endPoint.y }
      });
    } else if (entity instanceof AcDbPolyline) {
      const points = polylinePoints(entity);
      polylines.push({ entity, points, closed: Boolean(entity.closed), bounds: boundsFromPoints(points) });
    } else if (entity instanceof AcDbEllipse) {
      const axis = entity.majorAxis || { x: 1, y: 0 };
      ellipses.push({
        entity,
        center: { x: entity.center.x, y: entity.center.y },
        majorRadius: Math.abs(entity.majorRadius),
        minorRadius: Math.abs(entity.minorRadius),
        rotation: Math.atan2(axis.y, axis.x)
      });
    }
  }
  return { circles, lines, polylines, ellipses };
}

function drawingBounds(desc) {
  const points = [];
  desc.lines.forEach(({ a, b }) => points.push(a, b));
  desc.circles.forEach(({ center, radius }) => {
    points.push({ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius });
  });
  desc.polylines.forEach(({ points: pts }) => points.push(...pts));
  desc.ellipses.forEach(({ center, majorRadius, minorRadius, rotation }) => {
    const xExtent = Math.sqrt((majorRadius * Math.cos(rotation)) ** 2 + (minorRadius * Math.sin(rotation)) ** 2);
    const yExtent = Math.sqrt((majorRadius * Math.sin(rotation)) ** 2 + (minorRadius * Math.cos(rotation)) ** 2);
    points.push({ x: center.x - xExtent, y: center.y - yExtent }, { x: center.x + xExtent, y: center.y + yExtent });
  });
  return boundsFromPoints(points);
}

function isAxisAlignedRectangle(poly, tolerance) {
  if (!poly.closed || poly.points.length !== 4 || !poly.bounds) return false;
  const { minX, maxX, minY, maxY } = poly.bounds;
  return poly.points.every((point) => {
    const onX = Math.abs(point.x - minX) <= tolerance || Math.abs(point.x - maxX) <= tolerance;
    const onY = Math.abs(point.y - minY) <= tolerance || Math.abs(point.y - maxY) <= tolerance;
    return onX && onY;
  });
}

function groupCirclesByDiameter(circles, tolerance) {
  const groups = [];
  for (const circle of circles.filter((item) => item.radius > tolerance)) {
    let group = groups.find((candidate) => Math.abs(candidate.radius - circle.radius) <= tolerance);
    if (!group) {
      group = { radius: circle.radius, circles: [] };
      groups.push(group);
    }
    group.circles.push(circle);
  }
  return groups.sort((a, b) => b.radius - a.radius);
}

function detectBoltCircle(group, tolerance) {
  if (group.circles.length < 3) return null;
  const center = group.circles.reduce((acc, circle) => ({
    x: acc.x + circle.center.x / group.circles.length,
    y: acc.y + circle.center.y / group.circles.length
  }), { x: 0, y: 0 });
  const radii = group.circles.map((circle) => distance(circle.center, center));
  const avg = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  if (!(avg > group.radius * 1.25)) return null;
  const maxDeviation = Math.max(...radii.map((value) => Math.abs(value - avg)));
  if (maxDeviation > Math.max(tolerance * 3, avg * 0.015)) return null;
  return { center, radius: avg, count: group.circles.length };
}

function detectShaftRectangles(polylines, tolerance) {
  const rects = polylines
    .filter((poly) => isAxisAlignedRectangle(poly, tolerance))
    .map((poly) => ({ ...poly.bounds, poly }))
    .sort((a, b) => a.minX - b.minX);
  if (rects.length < 2) return null;
  const medianY = rects.reduce((sum, rect) => sum + rect.centerY, 0) / rects.length;
  const aligned = rects.filter((rect) => Math.abs(rect.centerY - medianY) <= Math.max(tolerance * 4, rect.height * 0.02));
  if (aligned.length < 2) return null;
  let contiguous = 0;
  for (let index = 1; index < aligned.length; index += 1) {
    if (Math.abs(aligned[index].minX - aligned[index - 1].maxX) <= Math.max(tolerance * 4, 0.5)) contiguous += 1;
  }
  if (contiguous < aligned.length - 1) return null;
  return aligned;
}

function addCircleDimensions(groups, bounds, step, tolerance, state) {
  let level = 0;
  for (const group of groups) {
    if (state.count >= MAX_AUTO_DIMS) return;
    const first = group.circles[0];
    const diameter = group.radius * 2;
    const label = `${group.circles.length > 1 ? `${group.circles.length}x ` : ''}Ø${fmt(diameter)}`;
    addDimension(
      { x: first.center.x - group.radius, y: first.center.y },
      { x: first.center.x + group.radius, y: first.center.y },
      { x: first.center.x, y: Math.max(bounds.maxY, first.center.y + group.radius) + step * (level + 1) },
      label
    );
    state.count += 1;
    const bolt = detectBoltCircle(group, tolerance);
    if (bolt && state.count < MAX_AUTO_DIMS) {
      addDimension(
        { x: bolt.center.x - bolt.radius, y: bolt.center.y },
        { x: bolt.center.x + bolt.radius, y: bolt.center.y },
        { x: bolt.center.x, y: bounds.maxY + step * (level + 2) },
        `PCD Ø${fmt(bolt.radius * 2)}`
      );
      state.count += 1;
      level += 1;
    }
    level += 1;
  }
}

function addShaftDimensions(rects, bounds, step, state) {
  if (!rects?.length) return new Set();
  const handled = new Set(rects.map((rect) => rect.poly.entity));
  for (const rect of rects) {
    if (state.count >= MAX_AUTO_DIMS) break;
    addDimension(
      { x: rect.minX, y: rect.minY },
      { x: rect.maxX, y: rect.minY },
      { x: rect.centerX, y: bounds.minY - step },
      fmt(rect.width)
    );
    state.count += 1;
    if (state.count >= MAX_AUTO_DIMS) break;
    addDimension(
      { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY },
      { x: rect.maxX + step * 0.7, y: rect.centerY },
      `Ø${fmt(rect.height)}`
    );
    state.count += 1;
  }
  if (state.count < MAX_AUTO_DIMS) {
    const minX = Math.min(...rects.map((rect) => rect.minX));
    const maxX = Math.max(...rects.map((rect) => rect.maxX));
    addDimension(
      { x: minX, y: bounds.minY },
      { x: maxX, y: bounds.minY },
      { x: (minX + maxX) / 2, y: bounds.minY - step * 2.1 },
      `TOTAL ${fmt(maxX - minX)}`
    );
    state.count += 1;
  }
  return handled;
}

function addPolylineDimensions(polylines, handled, bounds, step, state) {
  let level = 0;
  for (const poly of polylines) {
    if (state.count >= MAX_AUTO_DIMS) return;
    if (handled.has(poly.entity) || !poly.bounds) continue;
    const box = poly.bounds;
    if (box.width > EPS) {
      addDimension(
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.minY },
        { x: box.centerX, y: bounds.minY - step * (1 + level * 0.45) },
        fmt(box.width)
      );
      state.count += 1;
    }
    if (state.count >= MAX_AUTO_DIMS) return;
    if (box.height > EPS) {
      addDimension(
        { x: box.maxX, y: box.minY },
        { x: box.maxX, y: box.maxY },
        { x: bounds.maxX + step * (1 + level * 0.45), y: box.centerY },
        fmt(box.height)
      );
      state.count += 1;
    }
    level += 1;
  }
}

function addLineDimensions(lines, bounds, step, tolerance, state) {
  let hLevel = 0;
  let vLevel = 0;
  const seen = new Set();
  for (const line of lines) {
    if (state.count >= MAX_AUTO_DIMS) return;
    const dx = line.b.x - line.a.x;
    const dy = line.b.y - line.a.y;
    const len = Math.hypot(dx, dy);
    if (len <= tolerance) continue;
    const horizontal = Math.abs(dy) <= tolerance;
    const vertical = Math.abs(dx) <= tolerance;
    if (!horizontal && !vertical) continue;
    const key = `${horizontal ? 'H' : 'V'}:${fmt(len)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (horizontal) {
      addDimension(line.a, line.b, { x: (line.a.x + line.b.x) / 2, y: bounds.minY - step * (1 + hLevel * 0.5) }, fmt(len));
      hLevel += 1;
    } else {
      addDimension(line.a, line.b, { x: bounds.maxX + step * (1 + vLevel * 0.5), y: (line.a.y + line.b.y) / 2 }, fmt(len));
      vLevel += 1;
    }
    state.count += 1;
  }
}

function addEllipseDimensions(ellipses, bounds, step, state) {
  let level = 0;
  for (const ellipse of ellipses) {
    if (state.count >= MAX_AUTO_DIMS) return;
    const ux = Math.cos(ellipse.rotation);
    const uy = Math.sin(ellipse.rotation);
    const vx = -uy;
    const vy = ux;
    const p1 = { x: ellipse.center.x - ux * ellipse.majorRadius, y: ellipse.center.y - uy * ellipse.majorRadius };
    const p2 = { x: ellipse.center.x + ux * ellipse.majorRadius, y: ellipse.center.y + uy * ellipse.majorRadius };
    addDimension(p1, p2, { x: ellipse.center.x + vx * step * (level + 1), y: ellipse.center.y + vy * step * (level + 1) }, `MAIOR ${fmt(ellipse.majorRadius * 2)}`);
    state.count += 1;
    if (state.count >= MAX_AUTO_DIMS) return;
    const q1 = { x: ellipse.center.x - vx * ellipse.minorRadius, y: ellipse.center.y - vy * ellipse.minorRadius };
    const q2 = { x: ellipse.center.x + vx * ellipse.minorRadius, y: ellipse.center.y + vy * ellipse.minorRadius };
    addDimension(q1, q2, { x: bounds.maxX + step * (level + 1), y: ellipse.center.y }, `MENOR ${fmt(ellipse.minorRadius * 2)}`);
    state.count += 1;
    level += 1;
  }
}

function finalize(message, onStatus) {
  AcApDocManager.instance.curView.zoomToFitDrawing();
  onStatus(message);
}

function autoDimensionAll(onStatus = () => {}) {
  clearAutoDimensions();
  const desc = describeEntities();
  const bounds = drawingBounds(desc);
  if (!bounds) {
    onStatus('AUTO COTAR: não há geometria compatível no desenho.');
    return { count: 0 };
  }
  const span = Math.max(bounds.width, bounds.height, 1);
  const tolerance = Math.max(0.01, span * 0.0001);
  const step = Math.max(8, span * 0.06);
  const state = { count: 0 };
  const shaftRects = detectShaftRectangles(desc.polylines, tolerance);
  const handled = addShaftDimensions(shaftRects, bounds, step, state);
  addCircleDimensions(groupCirclesByDiameter(desc.circles, tolerance), bounds, step, tolerance, state);
  addPolylineDimensions(desc.polylines, handled, bounds, step, state);
  addLineDimensions(desc.lines, bounds, step, tolerance, state);
  addEllipseDimensions(desc.ellipses, bounds, step, state);
  finalize(`AUTO COTAR: ${state.count} cota(s) de fabricação gerada(s).`, onStatus);
  return { count: state.count };
}

function dimensionFlange({ center, outer, bore, pcd, holeCount, holeDiameter, thickness, sideX }, onStatus) {
  clearAutoDimensions();
  const step = Math.max(10, outer * 0.08);
  let count = 0;
  addDimension(
    { x: center.x - outer / 2, y: center.y },
    { x: center.x + outer / 2, y: center.y },
    { x: center.x, y: center.y + outer / 2 + step },
    `Ø${fmt(outer)}`
  ); count += 1;
  if (bore > 0) {
    addDimension(
      { x: center.x - bore / 2, y: center.y },
      { x: center.x + bore / 2, y: center.y },
      { x: center.x, y: center.y - outer / 2 - step },
      `Ø${fmt(bore)}`
    ); count += 1;
  }
  if (holeCount > 0 && holeDiameter > 0 && pcd > 0) {
    const first = { x: center.x + pcd / 2, y: center.y };
    addDimension(
      { x: first.x - holeDiameter / 2, y: first.y },
      { x: first.x + holeDiameter / 2, y: first.y },
      { x: first.x, y: center.y + outer / 2 + step * 2 },
      `${holeCount}x Ø${fmt(holeDiameter)}`
    ); count += 1;
    addDimension(
      { x: center.x - pcd / 2, y: center.y },
      { x: center.x + pcd / 2, y: center.y },
      { x: center.x, y: center.y + outer / 2 + step * 3 },
      `PCD Ø${fmt(pcd)}`
    ); count += 1;
  }
  if (thickness > 0) {
    addDimension(
      { x: sideX, y: center.y - outer / 2 },
      { x: sideX + thickness, y: center.y - outer / 2 },
      { x: sideX + thickness / 2, y: center.y - outer / 2 - step },
      `ESP. ${fmt(thickness)}`
    ); count += 1;
  }
  finalize(`Flange criado com ${count} cota(s) de fabricação.`, onStatus);
  return count;
}

async function createFlange(onStatus = () => {}) {
  const outer = asNumber(prompt('Diâmetro externo do flange (mm):', '300'));
  if (!(outer > 0)) return false;
  const bore = Math.max(0, asNumber(prompt('Diâmetro do furo central (mm):', '80')));
  const pcd = Math.max(0, asNumber(prompt('PCD dos furos (mm):', '220')));
  const holeCount = Math.max(0, Math.trunc(asNumber(prompt('Quantidade de furos:', '8'))));
  const holeDiameter = Math.max(0, asNumber(prompt('Diâmetro dos furos (mm):', '18')));
  const thickness = Math.max(0, asNumber(prompt('Espessura do flange (mm):', '20')));
  const center = await acquirePoint('Clique no centro do flange');
  if (!center) return false;
  appendCircle(center, outer / 2);
  if (bore > 0) appendCircle(center, bore / 2);
  if (pcd > 0 && holeCount > 0 && holeDiameter > 0) {
    for (let index = 0; index < holeCount; index += 1) {
      const angle = Math.PI * 2 * index / holeCount;
      appendCircle({ x: center.x + Math.cos(angle) * pcd / 2, y: center.y + Math.sin(angle) * pcd / 2 }, holeDiameter / 2);
    }
  }
  appendLine({ x: center.x - outer * 0.6, y: center.y }, { x: center.x + outer * 0.6, y: center.y });
  appendLine({ x: center.x, y: center.y - outer * 0.6 }, { x: center.x, y: center.y + outer * 0.6 });
  const gap = Math.max(25, outer * 0.2);
  const sideX = center.x + outer / 2 + gap;
  if (thickness > 0) appendRect(sideX, center.y - outer / 2, thickness, outer);
  dimensionFlange({ center, outer, bore, pcd, holeCount, holeDiameter, thickness, sideX }, onStatus);
  return true;
}

async function createDisc(onStatus = () => {}) {
  const outer = asNumber(prompt('Diâmetro externo do disco (mm):', '200'));
  if (!(outer > 0)) return false;
  const bore = Math.max(0, asNumber(prompt('Diâmetro do furo central (mm):', '0')));
  const thickness = Math.max(0, asNumber(prompt('Espessura do disco (mm):', '20')));
  const center = await acquirePoint('Clique no centro do disco');
  if (!center) return false;
  appendCircle(center, outer / 2);
  if (bore > 0) appendCircle(center, bore / 2);
  appendLine({ x: center.x - outer * 0.6, y: center.y }, { x: center.x + outer * 0.6, y: center.y });
  appendLine({ x: center.x, y: center.y - outer * 0.6 }, { x: center.x, y: center.y + outer * 0.6 });
  const step = Math.max(10, outer * 0.08);
  const sideX = center.x + outer / 2 + Math.max(25, outer * 0.2);
  if (thickness > 0) appendRect(sideX, center.y - outer / 2, thickness, outer);
  clearAutoDimensions();
  let count = 0;
  addDimension(
    { x: center.x - outer / 2, y: center.y },
    { x: center.x + outer / 2, y: center.y },
    { x: center.x, y: center.y + outer / 2 + step },
    `Ø${fmt(outer)}`
  ); count += 1;
  if (bore > 0) {
    addDimension(
      { x: center.x - bore / 2, y: center.y },
      { x: center.x + bore / 2, y: center.y },
      { x: center.x, y: center.y - outer / 2 - step },
      `Ø${fmt(bore)}`
    ); count += 1;
  }
  if (thickness > 0) {
    addDimension(
      { x: sideX, y: center.y - outer / 2 },
      { x: sideX + thickness, y: center.y - outer / 2 },
      { x: sideX + thickness / 2, y: center.y - outer / 2 - step },
      `ESP. ${fmt(thickness)}`
    ); count += 1;
  }
  finalize(`Disco criado com ${count} cota(s) de fabricação.`, onStatus);
  return true;
}

async function createShaft(onStatus = () => {}) {
  const raw = String(prompt('Trechos do eixo no formato comprimento x diâmetro separados por ;', '80x60;120x50;60x40') || '');
  const segments = raw.split(';').map((part) => {
    const [length, diameter] = part.toLowerCase().split('x').map((value) => asNumber(value));
    return { length, diameter };
  }).filter((segment) => segment.length > 0 && segment.diameter > 0);
  if (!segments.length) return false;
  const origin = await acquirePoint('Clique no centro da face inicial do eixo');
  if (!origin) return false;
  let x = origin.x;
  let maxDiameter = 0;
  const rects = [];
  for (const segment of segments) {
    appendRect(x, origin.y - segment.diameter / 2, segment.length, segment.diameter);
    rects.push({ minX: x, maxX: x + segment.length, minY: origin.y - segment.diameter / 2, maxY: origin.y + segment.diameter / 2, centerX: x + segment.length / 2, centerY: origin.y, width: segment.length, height: segment.diameter });
    maxDiameter = Math.max(maxDiameter, segment.diameter);
    x += segment.length;
  }
  appendLine({ x: origin.x, y: origin.y }, { x, y: origin.y });
  clearAutoDimensions();
  const step = Math.max(10, Math.max(x - origin.x, maxDiameter) * 0.055);
  let count = 0;
  for (const rect of rects) {
    addDimension(
      { x: rect.minX, y: rect.minY },
      { x: rect.maxX, y: rect.minY },
      { x: rect.centerX, y: origin.y - maxDiameter / 2 - step },
      fmt(rect.width)
    ); count += 1;
    addDimension(
      { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY },
      { x: rect.maxX + step * 0.75, y: origin.y },
      `Ø${fmt(rect.height)}`
    ); count += 1;
  }
  addDimension(
    { x: origin.x, y: origin.y - maxDiameter / 2 },
    { x, y: origin.y - maxDiameter / 2 },
    { x: (origin.x + x) / 2, y: origin.y - maxDiameter / 2 - step * 2.2 },
    `TOTAL ${fmt(x - origin.x)}`
  ); count += 1;
  finalize(`Eixo criado com ${count} cota(s) de fabricação.`, onStatus);
  return true;
}

export function createMlightAutoDimensionTools({ onStatus = () => {} } = {}) {
  getDb();
  return {
    autoDimensionAll: () => autoDimensionAll(onStatus),
    clearAutoDimensions,
    createFlange: () => createFlange(onStatus),
    createDisc: () => createDisc(onStatus),
    createShaft: () => createShaft(onStatus)
  };
}
