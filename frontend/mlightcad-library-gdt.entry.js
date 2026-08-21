import {
  AcApDocManager,
  AcEdPromptPointOptions,
  AcEdPromptStatus
} from '@mlightcad/cad-simple-viewer';
import {
  AcDbAlignedDimension,
  AcDbCircle,
  AcDbDataGenerator,
  AcDbLayerTableRecord,
  AcDbLine,
  AcDbMText,
  AcDbPolyline,
  AcGePoint2d
} from '@mlightcad/data-model';

const PART_LAYER = 'BIBLIOTECA_MECANICA';
const NOTE_LAYER = 'FAB_BIBLIOTECA_NOTAS';
const GDT_LAYER = 'FAB_GDT';
const NEST_LAYER = 'FAB_NESTING';
const DIM_PREFIX = '*LIBDIM';

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmt(value) {
  const parsed = num(value);
  if (Math.abs(parsed - Math.round(parsed)) < 0.005) return String(Math.round(parsed));
  return parsed.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function p3(point) {
  return { x: num(point?.x), y: num(point?.y), z: num(point?.z) };
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

function appendLine(a, b, layer = PART_LAYER) {
  const entity = applyLayer(new AcDbLine(p3(a), p3(b)), layer);
  getModel().appendEntity(entity);
  return entity;
}

function appendCircle(center, radius, layer = PART_LAYER) {
  const entity = applyLayer(new AcDbCircle(p3(center), Math.abs(num(radius))), layer);
  getModel().appendEntity(entity);
  return entity;
}

function appendRect(x, y, width, height, layer = PART_LAYER) {
  const poly = applyLayer(new AcDbPolyline(), layer);
  const points = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ];
  points.forEach((point, index) => poly.addVertexAt(index, new AcGePoint2d(point.x, point.y)));
  poly.closed = true;
  getModel().appendEntity(poly);
  return poly;
}

function appendText(text, x, y, height = 3.2, width = 80, layer = NOTE_LAYER) {
  const entity = applyLayer(new AcDbMText(), layer);
  entity.location = { x, y, z: 0 };
  entity.contents = String(text ?? '').replace(/[\r\n]+/g, ' ').trim();
  entity.height = Math.max(1, num(height, 3.2));
  entity.width = Math.max(entity.height * 2, num(width, 80));
  entity.lineSpacingFactor = 1;
  getModel().appendEntity(entity);
  return entity;
}

function nextDimBlockName(db) {
  let max = 0;
  for (const block of db.tables.blockTable.newIterator()) {
    const name = String(block?.name || '');
    if (!name.startsWith(DIM_PREFIX)) continue;
    const value = Number(name.slice(DIM_PREFIX.length));
    if (Number.isInteger(value) && value > max) max = value;
  }
  return `${DIM_PREFIX}${max + 1}`;
}

function addDimension(a, b, linePoint, label = '') {
  const db = getDb();
  try { new AcDbDataGenerator(db).createArrowBlock(); } catch (_error) {}
  const dim = new AcDbAlignedDimension(p3(a), p3(b), p3(linePoint));
  dim.rotation = Math.atan2(num(b.y) - num(a.y), num(b.x) - num(a.x));
  if (label) dim.dimensionText = label;
  const blockName = nextDimBlockName(db);
  db.tables.blockTable.add(dim.createDimBlock(blockName));
  dim.dimBlockId = blockName;
  dim.layer = NOTE_LAYER;
  ensureLayer(NOTE_LAYER);
  getModel().appendEntity(dim);
  return dim;
}

function addCenterMark(center, radius, layer = NOTE_LAYER) {
  const arm = Math.max(3, Math.min(12, radius * 0.35));
  appendLine({ x: center.x - arm, y: center.y }, { x: center.x + arm, y: center.y }, layer);
  appendLine({ x: center.x, y: center.y - arm }, { x: center.x, y: center.y + arm }, layer);
}

async function acquirePoint(message) {
  const options = new AcEdPromptPointOptions(message);
  const result = await AcApDocManager.instance.editor.getPoint(options);
  return result.status === AcEdPromptStatus.OK ? result.value : null;
}

function refresh() {
  try { AcApDocManager.instance.curView.zoomToFitDrawing(); } catch (_error) {}
}

function clearLayer(layer) {
  const view = AcApDocManager.instance.curView;
  let removed = 0;
  for (const entity of [...getModel().newIterator()]) {
    if (String(entity.layer || '') !== layer) continue;
    try { entity.erase(); } catch (_error) {}
    try { view?.removeEntity(entity); } catch (_error) {}
    removed += 1;
  }
  return removed;
}

function polyPoints(entity) {
  return Array.from({ length: entity.numberOfVertices || 0 }, (_, index) => {
    const point = entity.getPoint2dAt(index);
    return { x: point.x, y: point.y };
  });
}

function boundsOfEntity(entity) {
  if (String(entity?.layer || '').startsWith('FAB_')) return null;
  if (entity instanceof AcDbLine) {
    return {
      minX: Math.min(entity.startPoint.x, entity.endPoint.x),
      maxX: Math.max(entity.startPoint.x, entity.endPoint.x),
      minY: Math.min(entity.startPoint.y, entity.endPoint.y),
      maxY: Math.max(entity.startPoint.y, entity.endPoint.y)
    };
  }
  if (entity instanceof AcDbCircle) {
    return {
      minX: entity.center.x - Math.abs(entity.radius),
      maxX: entity.center.x + Math.abs(entity.radius),
      minY: entity.center.y - Math.abs(entity.radius),
      maxY: entity.center.y + Math.abs(entity.radius)
    };
  }
  if (entity instanceof AcDbPolyline) {
    const points = polyPoints(entity);
    if (!points.length) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }
  return null;
}

function drawingBounds() {
  const boxes = [];
  for (const entity of getModel().newIterator()) {
    const bounds = boundsOfEntity(entity);
    if (bounds) boxes.push(bounds);
  }
  if (!boxes.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return {
    minX: Math.min(...boxes.map((item) => item.minX)),
    maxX: Math.max(...boxes.map((item) => item.maxX)),
    minY: Math.min(...boxes.map((item) => item.minY)),
    maxY: Math.max(...boxes.map((item) => item.maxY))
  };
}

async function createBushing(onStatus) {
  const outer = Math.abs(num(prompt('BUCHA - diâmetro externo (mm):', '80')));
  const inner = Math.abs(num(prompt('BUCHA - diâmetro interno (mm):', '60')));
  const length = Math.abs(num(prompt('BUCHA - comprimento (mm):', '45')));
  if (!(outer > 0 && inner >= 0 && inner < outer && length > 0)) throw new Error('Dimensões inválidas para a bucha.');
  const center = await acquirePoint('Clique no centro da vista frontal da bucha');
  if (!center) return false;
  appendCircle(center, outer / 2);
  if (inner > 0) appendCircle(center, inner / 2);
  addCenterMark(center, outer / 2);
  const gap = Math.max(30, outer * 0.35);
  const sideX = center.x + outer / 2 + gap;
  appendRect(sideX, center.y - outer / 2, length, outer);
  if (inner > 0) {
    appendLine({ x: sideX, y: center.y - inner / 2 }, { x: sideX + length, y: center.y - inner / 2 }, NOTE_LAYER);
    appendLine({ x: sideX, y: center.y + inner / 2 }, { x: sideX + length, y: center.y + inner / 2 }, NOTE_LAYER);
  }
  const step = Math.max(10, outer * 0.12);
  addDimension({ x: center.x - outer / 2, y: center.y }, { x: center.x + outer / 2, y: center.y }, { x: center.x, y: center.y + outer / 2 + step }, `Ø${fmt(outer)}`);
  if (inner > 0) addDimension({ x: center.x - inner / 2, y: center.y }, { x: center.x + inner / 2, y: center.y }, { x: center.x, y: center.y - outer / 2 - step }, `Ø${fmt(inner)}`);
  addDimension({ x: sideX, y: center.y - outer / 2 }, { x: sideX + length, y: center.y - outer / 2 }, { x: sideX + length / 2, y: center.y - outer / 2 - step }, fmt(length));
  appendText(`BUCHA Ø${fmt(outer)} / Ø${fmt(inner)} x ${fmt(length)} mm`, center.x - outer / 2, center.y + outer / 2 + step * 2, 3.2, 100);
  refresh();
  onStatus('Bucha paramétrica criada e cotada.');
  return { type: 'BUCHA', outer, inner, length };
}

async function createWasher(onStatus) {
  const outer = Math.abs(num(prompt('ANEL/ARRUELA - diâmetro externo (mm):', '100')));
  const inner = Math.abs(num(prompt('ANEL/ARRUELA - diâmetro interno (mm):', '60')));
  const thickness = Math.abs(num(prompt('ANEL/ARRUELA - espessura (mm):', '12')));
  if (!(outer > 0 && inner >= 0 && inner < outer && thickness > 0)) throw new Error('Dimensões inválidas para o anel/arruela.');
  const center = await acquirePoint('Clique no centro do anel/arruela');
  if (!center) return false;
  appendCircle(center, outer / 2);
  if (inner > 0) appendCircle(center, inner / 2);
  addCenterMark(center, outer / 2);
  const sideX = center.x + outer / 2 + Math.max(25, outer * 0.3);
  appendRect(sideX, center.y - outer / 2, thickness, outer);
  const step = Math.max(10, outer * 0.12);
  addDimension({ x: center.x - outer / 2, y: center.y }, { x: center.x + outer / 2, y: center.y }, { x: center.x, y: center.y + outer / 2 + step }, `Ø${fmt(outer)}`);
  if (inner > 0) addDimension({ x: center.x - inner / 2, y: center.y }, { x: center.x + inner / 2, y: center.y }, { x: center.x, y: center.y - outer / 2 - step }, `Ø${fmt(inner)}`);
  addDimension({ x: sideX, y: center.y - outer / 2 }, { x: sideX + thickness, y: center.y - outer / 2 }, { x: sideX + thickness / 2, y: center.y - outer / 2 - step }, `ESP. ${fmt(thickness)}`);
  refresh();
  onStatus('Anel/arruela paramétrico criado e cotado.');
  return { type: 'ANEL', outer, inner, thickness };
}

async function createParallelKey(onStatus) {
  const length = Math.abs(num(prompt('CHAVETA - comprimento (mm):', '70')));
  const width = Math.abs(num(prompt('CHAVETA - largura (mm):', '18')));
  const height = Math.abs(num(prompt('CHAVETA - altura (mm):', '11')));
  if (!(length > 0 && width > 0 && height > 0)) throw new Error('Dimensões inválidas para a chaveta.');
  const origin = await acquirePoint('Clique no canto inferior esquerdo da chaveta');
  if (!origin) return false;
  appendRect(origin.x, origin.y, length, width);
  const sideY = origin.y + width + Math.max(20, width * 1.5);
  appendRect(origin.x, sideY, length, height);
  const step = Math.max(8, width * 0.8);
  addDimension({ x: origin.x, y: origin.y }, { x: origin.x + length, y: origin.y }, { x: origin.x + length / 2, y: origin.y - step }, fmt(length));
  addDimension({ x: origin.x + length, y: origin.y }, { x: origin.x + length, y: origin.y + width }, { x: origin.x + length + step, y: origin.y + width / 2 }, fmt(width));
  addDimension({ x: origin.x + length, y: sideY }, { x: origin.x + length, y: sideY + height }, { x: origin.x + length + step, y: sideY + height / 2 }, fmt(height));
  appendText(`CHAVETA ${fmt(width)} x ${fmt(height)} x ${fmt(length)} mm`, origin.x, sideY + height + 10, 3.2, 100);
  refresh();
  onStatus('Chaveta paralela criada e cotada.');
  return { type: 'CHAVETA', length, width, height };
}

async function createPerforatedPlate(onStatus) {
  const width = Math.abs(num(prompt('PLACA - largura (mm):', '300')));
  const height = Math.abs(num(prompt('PLACA - altura (mm):', '200')));
  const thickness = Math.abs(num(prompt('PLACA - espessura (mm):', '12')));
  const rows = Math.max(1, Math.min(20, Math.trunc(num(prompt('Quantidade de linhas de furos:', '2'), 2))));
  const cols = Math.max(1, Math.min(20, Math.trunc(num(prompt('Quantidade de colunas de furos:', '3'), 3))));
  const hole = Math.abs(num(prompt('Diâmetro dos furos (mm):', '18')));
  const edgeX = Math.max(0, num(prompt('Distância da borda lateral ao centro do primeiro furo (mm):', '30'), 30));
  const edgeY = Math.max(0, num(prompt('Distância da borda inferior ao centro do primeiro furo (mm):', '30'), 30));
  if (!(width > 0 && height > 0 && thickness > 0 && hole > 0 && edgeX * 2 <= width && edgeY * 2 <= height)) throw new Error('Dimensões inválidas para a placa perfurada.');
  const origin = await acquirePoint('Clique no canto inferior esquerdo da placa');
  if (!origin) return false;
  appendRect(origin.x, origin.y, width, height);
  const pitchX = cols > 1 ? (width - edgeX * 2) / (cols - 1) : 0;
  const pitchY = rows > 1 ? (height - edgeY * 2) / (rows - 1) : 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const center = { x: origin.x + edgeX + pitchX * col, y: origin.y + edgeY + pitchY * row };
      appendCircle(center, hole / 2);
      addCenterMark(center, hole / 2);
    }
  }
  const step = Math.max(10, Math.max(width, height) * 0.05);
  addDimension({ x: origin.x, y: origin.y }, { x: origin.x + width, y: origin.y }, { x: origin.x + width / 2, y: origin.y - step }, fmt(width));
  addDimension({ x: origin.x + width, y: origin.y }, { x: origin.x + width, y: origin.y + height }, { x: origin.x + width + step, y: origin.y + height / 2 }, fmt(height));
  appendText(`${rows * cols}x Ø${fmt(hole)} | ESP. ${fmt(thickness)} mm`, origin.x, origin.y + height + step, 3.2, 120);
  if (cols > 1) appendText(`PASSO X = ${fmt(pitchX)} mm`, origin.x, origin.y + height + step * 1.7, 3, 100);
  if (rows > 1) appendText(`PASSO Y = ${fmt(pitchY)} mm`, origin.x, origin.y + height + step * 2.4, 3, 100);
  refresh();
  onStatus('Placa perfurada paramétrica criada e cotada.');
  return { type: 'PLACA_PERFURADA', width, height, thickness, rows, cols, hole };
}

async function openLibrary(onStatus = () => {}) {
  const choice = String(prompt('BIBLIOTECA MECÂNICA\n1 - Bucha\n2 - Anel / Arruela\n3 - Chaveta paralela\n4 - Placa perfurada\n\nInforme a opção:', '1') || '').trim().toLowerCase();
  if (['1', 'bucha'].includes(choice)) return createBushing(onStatus);
  if (['2', 'anel', 'arruela'].includes(choice)) return createWasher(onStatus);
  if (['3', 'chaveta'].includes(choice)) return createParallelKey(onStatus);
  if (['4', 'placa', 'placaperfurada'].includes(choice.replace(/\s+/g, ''))) return createPerforatedPlate(onStatus);
  onStatus('Biblioteca mecânica: operação cancelada.');
  return false;
}

function gdtFrame(cells, x, y) {
  let cursor = x;
  const height = 9;
  for (const raw of cells) {
    const text = String(raw || '').trim() || '—';
    const width = Math.max(14, Math.min(55, text.length * 4.2 + 8));
    appendRect(cursor, y, width, height, GDT_LAYER);
    appendText(text, cursor + 2, y + 6.3, 3, width - 4, GDT_LAYER);
    cursor += width;
  }
  return cursor - x;
}

async function addDatum(onStatus = () => {}) {
  const label = String(prompt('Identificação do datum (A, B, C...):', 'A') || 'A').trim().toUpperCase().slice(0, 3);
  const point = await acquirePoint('Clique no elemento de referência do datum');
  if (!point) return false;
  const elbow = { x: point.x + 12, y: point.y + 10 };
  appendLine(point, elbow, GDT_LAYER);
  appendLine(elbow, { x: elbow.x + 12, y: elbow.y }, GDT_LAYER);
  gdtFrame([label], elbow.x + 12, elbow.y - 4.5);
  onStatus(`Datum ${label} adicionado.`);
  return true;
}

async function addFeatureControlFrame(onStatus = () => {}) {
  const choice = String(prompt('GD&T\n1 - Posição\n2 - Perpendicularidade\n3 - Paralelismo\n4 - Planicidade\n5 - Cilindricidade\n6 - Batimento circular\n\nInforme a opção:', '1') || '').trim();
  const map = {
    '1': { symbol: '⌖', name: 'POSIÇÃO', diameter: true },
    '2': { symbol: '⟂', name: 'PERPENDICULARIDADE' },
    '3': { symbol: '∥', name: 'PARALELISMO' },
    '4': { symbol: '⏥', name: 'PLANICIDADE' },
    '5': { symbol: '⌭', name: 'CILINDRICIDADE' },
    '6': { symbol: '↗', name: 'BATIMENTO CIRCULAR' }
  };
  const spec = map[choice] || map['1'];
  const tolerance = String(prompt(`Tolerância para ${spec.name} (mm):`, '0,05') || '0,05').trim();
  const zone = spec.diameter && window.confirm('Usar zona de tolerância diametral?') ? `Ø${tolerance}` : tolerance;
  const datums = String(prompt('Datums de referência separados por vírgula (deixe vazio se não aplicável):', 'A,B') || '')
    .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean).slice(0, 3);
  const point = await acquirePoint('Clique no elemento controlado');
  if (!point) return false;
  const elbow = { x: point.x + 16, y: point.y + 12 };
  appendLine(point, elbow, GDT_LAYER);
  appendLine(elbow, { x: elbow.x + 18, y: elbow.y }, GDT_LAYER);
  gdtFrame([spec.symbol, zone, ...datums], elbow.x + 18, elbow.y - 4.5);
  appendText(spec.name, elbow.x + 18, elbow.y + 10, 2.6, 70, GDT_LAYER);
  onStatus(`Controle GD&T de ${spec.name.toLowerCase()} adicionado.`);
  return true;
}

async function openGdt(onStatus = () => {}) {
  const choice = String(prompt('GD&T\n1 - Criar Datum\n2 - Quadro de controle geométrico\n\nInforme a opção:', '2') || '').trim();
  if (choice === '1') return addDatum(onStatus);
  if (choice === '2') return addFeatureControlFrame(onStatus);
  return false;
}

function detectRectangularParts() {
  const result = [];
  let index = 1;
  for (const entity of getModel().newIterator()) {
    if (!(entity instanceof AcDbPolyline) || !entity.closed || String(entity.layer || '').startsWith('FAB_')) continue;
    const points = polyPoints(entity);
    if (points.length !== 4) continue;
    const xs = [...new Set(points.map((point) => Number(point.x.toFixed(6))))];
    const ys = [...new Set(points.map((point) => Number(point.y.toFixed(6))))];
    if (xs.length !== 2 || ys.length !== 2) continue;
    const width = Math.abs(xs[1] - xs[0]);
    const height = Math.abs(ys[1] - ys[0]);
    if (!(width > 0 && height > 0)) continue;
    result.push({ id: `RECT-${index}`, name: `PEÇA ${index}`, width_mm: width, height_mm: height, quantity: 1 });
    index += 1;
  }
  return result;
}

function applyNestingPlan(result, onStatus = () => {}) {
  if (!result?.placements?.length || !result?.sheet) throw new Error('Resultado de nesting vazio.');
  clearLayer(NEST_LAYER);
  ensureLayer(NEST_LAYER);
  const bounds = drawingBounds();
  const sheetW = num(result.sheet.width_mm);
  const sheetH = num(result.sheet.height_mm);
  const gap = Math.max(80, sheetW * 0.08);
  const baseX = bounds.maxX + gap;
  const baseY = bounds.minY;
  const bySheet = new Map();
  for (const placement of result.placements) {
    const list = bySheet.get(placement.sheet) || [];
    list.push(placement);
    bySheet.set(placement.sheet, list);
  }
  const summaries = new Map((result.sheets || []).map((item) => [item.sheet, item]));
  const sheetIndexes = [...bySheet.keys()].sort((a, b) => a - b);
  sheetIndexes.forEach((sheetIndex, position) => {
    const offsetX = baseX;
    const offsetY = baseY - position * (sheetH + gap);
    appendRect(offsetX, offsetY, sheetW, sheetH, NEST_LAYER);
    const summary = summaries.get(sheetIndex);
    appendText(`CHAPA ${sheetIndex} | APROVEITAMENTO ${fmt(summary?.utilization_percent || 0)}%`, offsetX, offsetY + sheetH + 12, 4, Math.max(140, sheetW * 0.5), NEST_LAYER);
    for (const item of bySheet.get(sheetIndex) || []) {
      appendRect(offsetX + num(item.x_mm), offsetY + num(item.y_mm), num(item.width_mm), num(item.height_mm), NEST_LAYER);
      appendText(item.name || item.id, offsetX + num(item.x_mm) + 2, offsetY + num(item.y_mm) + Math.min(10, num(item.height_mm) * 0.5), Math.max(2.2, Math.min(5, num(item.height_mm) * 0.12)), Math.max(20, num(item.width_mm) - 4), NEST_LAYER);
    }
  });
  refresh();
  onStatus(`Plano de corte gerado no CAD: ${result.summary?.parts_placed || result.placements.length} peça(s) em ${result.summary?.sheets_used || sheetIndexes.length} chapa(s).`);
  return true;
}

export function createMlightLibraryGdtTools({ onStatus = () => {} } = {}) {
  return {
    openLibrary: () => openLibrary(onStatus),
    createBushing: () => createBushing(onStatus),
    createWasher: () => createWasher(onStatus),
    createParallelKey: () => createParallelKey(onStatus),
    createPerforatedPlate: () => createPerforatedPlate(onStatus),
    openGdt: () => openGdt(onStatus),
    addDatum: () => addDatum(onStatus),
    addFeatureControlFrame: () => addFeatureControlFrame(onStatus),
    detectRectangularParts,
    applyNestingPlan: (result) => applyNestingPlan(result, onStatus),
    clearNestingPlan: () => clearLayer(NEST_LAYER)
  };
}
