import { AcApDocManager, AcEdPromptPointOptions, AcEdPromptStatus } from '@mlightcad/cad-simple-viewer';
import {
  AcDbCircle,
  AcDbEllipse,
  AcDbLayerTableRecord,
  AcDbLine,
  AcDbMText,
  AcDbPolyline,
  AcGePoint2d
} from '@mlightcad/data-model';

const SHEET_LAYER = 'FAB_FOLHA_TECNICA';
const NOTE_LAYER = 'FAB_NOTAS_TECNICAS';
const CENTER_LAYER = 'FAB_EIXOS_CENTRO';
const KEYWAY_LAYER = 'FAB_RASGOS_CHAVETA';
const GENERATED_LAYERS = new Set([SHEET_LAYER, NOTE_LAYER, CENTER_LAYER, KEYWAY_LAYER]);
const EPS = 1e-6;

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

function appendLine(a, b, layer = NOTE_LAYER) {
  const entity = applyLayer(new AcDbLine(
    { x: asNumber(a.x), y: asNumber(a.y), z: 0 },
    { x: asNumber(b.x), y: asNumber(b.y), z: 0 }
  ), layer);
  getModel().appendEntity(entity);
  return entity;
}

function appendRect(x, y, width, height, layer = SHEET_LAYER) {
  const poly = applyLayer(new AcDbPolyline(), layer);
  const points = [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }
  ];
  points.forEach((point, index) => poly.addVertexAt(index, new AcGePoint2d(point.x, point.y)));
  poly.closed = true;
  getModel().appendEntity(poly);
  return poly;
}

function appendText(text, x, y, height = 3.2, width = 60, layer = NOTE_LAYER, rotation = 0) {
  const entity = applyLayer(new AcDbMText(), layer);
  entity.location = { x, y, z: 0 };
  entity.contents = cleanText(text);
  entity.height = Math.max(1, asNumber(height, 3.2));
  entity.width = Math.max(entity.height * 2, asNumber(width, 60));
  entity.lineSpacingFactor = 1;
  entity.rotation = rotation;
  getModel().appendEntity(entity);
  return entity;
}

function appendCenterMark(center, radius = 5) {
  appendLine({ x: center.x - radius, y: center.y }, { x: center.x + radius, y: center.y }, CENTER_LAYER);
  appendLine({ x: center.x, y: center.y - radius }, { x: center.x, y: center.y + radius }, CENTER_LAYER);
}

function entityBounds(entity) {
  if (!entity || GENERATED_LAYERS.has(String(entity.layer || ''))) return null;
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
      minX: entity.center.x - Math.abs(entity.radius), maxX: entity.center.x + Math.abs(entity.radius),
      minY: entity.center.y - Math.abs(entity.radius), maxY: entity.center.y + Math.abs(entity.radius)
    };
  }
  if (entity instanceof AcDbEllipse) {
    const axis = entity.majorAxis || { x: 1, y: 0 };
    const rotation = Math.atan2(axis.y, axis.x);
    const major = Math.abs(entity.majorRadius);
    const minor = Math.abs(entity.minorRadius);
    const ex = Math.sqrt((major * Math.cos(rotation)) ** 2 + (minor * Math.sin(rotation)) ** 2);
    const ey = Math.sqrt((major * Math.sin(rotation)) ** 2 + (minor * Math.cos(rotation)) ** 2);
    return { minX: entity.center.x - ex, maxX: entity.center.x + ex, minY: entity.center.y - ey, maxY: entity.center.y + ey };
  }
  if (entity instanceof AcDbPolyline) {
    const points = Array.from({ length: entity.numberOfVertices || 0 }, (_, index) => entity.getPoint2dAt(index));
    if (!points.length) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }
  return null;
}

function drawingBounds() {
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
  return {
    minX, maxX, minY, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function clearGeneratedLayer(layerName) {
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

function clearTechnicalSheet() {
  return clearGeneratedLayer(SHEET_LAYER);
}

function refreshView() {
  try { AcApDocManager.instance.curView.zoomToFitDrawing(); } catch (_error) {}
}

async function acquirePoint(message) {
  const options = new AcEdPromptPointOptions(message);
  const result = await AcApDocManager.instance.editor.getPoint(options);
  return result.status === AcEdPromptStatus.OK ? result.value : null;
}

function formatDate() {
  try { return new Intl.DateTimeFormat('pt-BR').format(new Date()); } catch (_error) { return new Date().toISOString().slice(0, 10); }
}

function normalizeFormat(value) {
  const format = cleanText(value, 'A3').toUpperCase();
  return format === 'A4' ? 'A4' : 'A3';
}

function formatSpec(format) {
  return format === 'A4'
    ? { name: 'A4', width: 297, height: 210 }
    : { name: 'A3', width: 420, height: 297 };
}

function drawZones(x0, y0, width, height) {
  const columns = 6;
  const rows = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < columns; i += 1) {
    const x = x0 + (width * (i + 0.5)) / columns;
    appendText(String(i + 1), x - 1, y0 + height - 2, 2.5, 8, SHEET_LAYER);
    appendText(String(i + 1), x - 1, y0 + 4, 2.5, 8, SHEET_LAYER);
  }
  rows.forEach((row, index) => {
    const y = y0 + height - ((index + 0.5) * height) / rows.length;
    appendText(row, x0 + 2, y, 2.5, 8, SHEET_LAYER);
    appendText(row, x0 + width - 6, y, 2.5, 8, SHEET_LAYER);
  });
}

function titleField(label, value, x, y, width, labelWidth = 22) {
  appendText(label, x + 2, y + 6.5, 2.3, labelWidth, SHEET_LAYER);
  appendText(value || '—', x + labelWidth, y + 6.8, 3, Math.max(20, width - labelWidth - 2), SHEET_LAYER);
}

function createTechnicalSheet(cadData = {}, onStatus = () => {}) {
  const bounds = drawingBounds();
  if (!bounds) throw new Error('Crie ou importe uma peça antes de gerar a folha técnica.');

  const requested = normalizeFormat(prompt('Formato da folha (A3 ou A4):', cadData?.manufacturing?.sheetFormat || 'A3'));
  let spec = formatSpec(requested);
  const revision = cleanText(prompt('Revisão do desenho:', cadData?.manufacturing?.revision || '00'), '00');
  const author = cleanText(prompt('Projetista / responsável:', cadData?.manufacturing?.author || 'MANUTENÇÃO'), 'MANUTENÇÃO');
  const quantity = Math.max(1, Math.trunc(asNumber(prompt('Quantidade da peça:', cadData?.manufacturing?.quantity || '1'), 1)));
  const generalTolerance = cleanText(prompt('Tolerância geral:', cadData?.manufacturing?.generalTolerance || '±0,10 mm'), '±0,10 mm');

  const margin = 10;
  const titleHeight = 45;
  const available = (sheet) => ({ width: sheet.width - margin * 2, height: sheet.height - margin * 2 - titleHeight - 10 });
  let area = available(spec);
  if ((bounds.width > area.width || bounds.height > area.height) && requested === 'A4') {
    spec = formatSpec('A3');
    area = available(spec);
    onStatus('A4 não comporta a geometria em 1:1; folha alterada automaticamente para A3.');
  }
  if (bounds.width > area.width || bounds.height > area.height) {
    throw new Error(`A peça mede aproximadamente ${bounds.width.toFixed(1)} x ${bounds.height.toFixed(1)} mm e não cabe em ${spec.name} 1:1. Use layout em escala em uma próxima etapa.`);
  }

  clearTechnicalSheet();
  ensureLayer(SHEET_LAYER);

  const x0 = bounds.centerX - spec.width / 2;
  const drawingCenterY = margin + titleHeight + 5 + area.height / 2;
  const y0 = bounds.centerY - drawingCenterY;
  const innerX = x0 + margin;
  const innerY = y0 + margin;
  const innerW = spec.width - margin * 2;
  const innerH = spec.height - margin * 2;

  appendRect(x0, y0, spec.width, spec.height, SHEET_LAYER);
  appendRect(innerX, innerY, innerW, innerH, SHEET_LAYER);
  drawZones(x0, y0, spec.width, spec.height);

  const titleW = spec.name === 'A3' ? 165 : 145;
  const titleX = innerX + innerW - titleW;
  const titleY = innerY;
  appendRect(titleX, titleY, titleW, titleHeight, SHEET_LAYER);
  appendLine({ x: titleX, y: titleY + 15 }, { x: titleX + titleW, y: titleY + 15 }, SHEET_LAYER);
  appendLine({ x: titleX, y: titleY + 30 }, { x: titleX + titleW, y: titleY + 30 }, SHEET_LAYER);
  appendLine({ x: titleX + titleW * 0.62, y: titleY }, { x: titleX + titleW * 0.62, y: titleY + 30 }, SHEET_LAYER);

  appendText('DESENHO MECÂNICO DE FABRICAÇÃO', titleX + 2, titleY + titleHeight - 3, 3.6, titleW - 4, SHEET_LAYER);
  titleField('TÍTULO', cleanText(cadData.titulo, 'PEÇA MECÂNICA'), titleX, titleY + 30, titleW, 21);
  titleField('CÓDIGO', cleanText(cadData.codigo, 'CAD'), titleX, titleY + 15, titleW * 0.62, 21);
  titleField('MATERIAL', cleanText(cadData.material, 'A DEFINIR'), titleX + titleW * 0.62, titleY + 15, titleW * 0.38, 18);
  titleField('FORMATO', spec.name, titleX, titleY, titleW * 0.2, 15);
  titleField('ESCALA', '1:1', titleX + titleW * 0.2, titleY, titleW * 0.18, 14);
  titleField('REV', revision, titleX + titleW * 0.38, titleY, titleW * 0.14, 9);
  titleField('QTD', String(quantity), titleX + titleW * 0.52, titleY, titleW * 0.12, 9);
  titleField('DATA', formatDate(), titleX + titleW * 0.64, titleY, titleW * 0.36, 11);

  const notesX = innerX + 4;
  appendText(`UNIDADE: mm   |   TOLERÂNCIA GERAL: ${generalTolerance}`, notesX, titleY + 11, 2.8, Math.max(60, titleX - notesX - 5), SHEET_LAYER);
  appendText(`RESPONSÁVEL: ${author}`, notesX, titleY + 6, 2.8, Math.max(60, titleX - notesX - 5), SHEET_LAYER);
  appendText(`EQUIPAMENTO: ${cleanText(cadData.equipamento_nome || cadData.equipamento || cadData.equipmentName, 'NÃO VINCULADO')}`, notesX, titleY + 1.5, 2.8, Math.max(60, titleX - notesX - 5), SHEET_LAYER);

  refreshView();
  const manufacturing = {
    ...(cadData.manufacturing || {}),
    sheetFormat: spec.name,
    revision,
    author,
    quantity,
    generalTolerance,
    generatedAt: new Date().toISOString()
  };
  onStatus(`Folha técnica ${spec.name} 1:1 gerada com quadro de fabricação.`);
  return { ok: true, manufacturing, format: spec.name };
}

async function addSurfaceFinish(onStatus = () => {}) {
  const value = cleanText(prompt('Rugosidade (ex.: N7 / Ra 1,6 µm):', 'N7 / Ra 1,6 µm'), 'N7');
  const point = await acquirePoint('Clique no ponto de aplicação da rugosidade');
  if (!point) return false;
  appendLine(point, { x: point.x + 4, y: point.y - 2 }, NOTE_LAYER);
  appendLine({ x: point.x + 4, y: point.y - 2 }, { x: point.x + 8, y: point.y + 5 }, NOTE_LAYER);
  appendLine({ x: point.x + 8, y: point.y + 5 }, { x: point.x + 14, y: point.y + 5 }, NOTE_LAYER);
  appendText(value, point.x + 9, point.y + 8, 3, 35, NOTE_LAYER);
  onStatus(`Rugosidade ${value} adicionada.`);
  return true;
}

async function addLeaderNote(title, defaultText, onStatus = () => {}) {
  const text = cleanText(prompt(title, defaultText), defaultText);
  const point = await acquirePoint('Clique no ponto da peça para a chamada');
  if (!point) return false;
  const elbow = { x: point.x + 14, y: point.y + 10 };
  const end = { x: point.x + 36, y: point.y + 10 };
  appendLine(point, elbow, NOTE_LAYER);
  appendLine(elbow, end, NOTE_LAYER);
  appendText(text, end.x + 2, end.y + 3, 3, 55, NOTE_LAYER);
  onStatus(`${text} adicionado ao desenho.`);
  return true;
}

async function addTolerance(onStatus = () => {}) {
  return addLeaderNote('Tolerância / ajuste (ex.: Ø60 h7 ou +0,02 / 0):', 'Ø60 h7', onStatus);
}

async function addThread(onStatus = () => {}) {
  return addLeaderNote('Rosca (ex.: M50x1,5 - 6g):', 'M50x1,5 - 6g', onStatus);
}

async function addChamferRadius(onStatus = () => {}) {
  return addLeaderNote('Chanfro ou raio (ex.: 2x45° ou R3):', '2x45°', onStatus);
}

async function addSectionMarker(onStatus = () => {}) {
  const label = cleanText(prompt('Identificação do corte:', 'A'), 'A').slice(0, 3).toUpperCase();
  const p1 = await acquirePoint('Primeiro ponto da linha de corte');
  if (!p1) return false;
  const p2 = await acquirePoint('Segundo ponto da linha de corte');
  if (!p2) return false;
  appendLine(p1, p2, NOTE_LAYER);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.max(EPS, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const tick = 4;
  appendLine({ x: p1.x - nx * tick, y: p1.y - ny * tick }, { x: p1.x + nx * tick, y: p1.y + ny * tick }, NOTE_LAYER);
  appendLine({ x: p2.x - nx * tick, y: p2.y - ny * tick }, { x: p2.x + nx * tick, y: p2.y + ny * tick }, NOTE_LAYER);
  appendText(`${label}-${label}`, p1.x + nx * 7, p1.y + ny * 7, 3.2, 20, NOTE_LAYER);
  appendText(`${label}-${label}`, p2.x + nx * 7, p2.y + ny * 7, 3.2, 20, NOTE_LAYER);
  onStatus(`Linha de corte ${label}-${label} criada.`);
  return true;
}

async function createKeyway(onStatus = () => {}) {
  const length = Math.abs(asNumber(prompt('Comprimento do rasgo de chaveta (mm):', '70')));
  const width = Math.abs(asNumber(prompt('Largura da chaveta (mm):', '18')));
  const depth = Math.abs(asNumber(prompt('Profundidade do rasgo (mm):', '6')));
  if (!(length > 0 && width > 0 && depth > 0)) throw new Error('Informe comprimento, largura e profundidade válidos.');
  const center = await acquirePoint('Clique no centro do rasgo de chaveta');
  if (!center) return false;
  appendRect(center.x - length / 2, center.y - width / 2, length, width, KEYWAY_LAYER);
  appendLine({ x: center.x - length / 2 - 5, y: center.y }, { x: center.x + length / 2 + 5, y: center.y }, CENTER_LAYER);
  appendText(`RASGO CHAVETA ${width} x ${depth} x ${length} mm`, center.x - length / 2, center.y + width / 2 + 8, 3, Math.max(60, length), NOTE_LAYER);
  onStatus(`Rasgo de chaveta ${width} x ${depth} x ${length} mm criado.`);
  return true;
}

function addCenterMarks(onStatus = () => {}) {
  let count = 0;
  for (const entity of getModel().newIterator()) {
    if (!(entity instanceof AcDbCircle) || GENERATED_LAYERS.has(String(entity.layer || ''))) continue;
    appendCenterMark({ x: entity.center.x, y: entity.center.y }, Math.min(Math.max(entity.radius * 0.35, 3), 12));
    count += 1;
  }
  refreshView();
  onStatus(`${count} marca(s) de centro gerada(s).`);
  return { count };
}

export function createMlightManufacturingTools({ cadData = {}, onStatus = () => {} } = {}) {
  return {
    createTechnicalSheet: () => createTechnicalSheet(cadData, onStatus),
    clearTechnicalSheet,
    addSurfaceFinish: () => addSurfaceFinish(onStatus),
    addTolerance: () => addTolerance(onStatus),
    addThread: () => addThread(onStatus),
    addChamferRadius: () => addChamferRadius(onStatus),
    addSectionMarker: () => addSectionMarker(onStatus),
    createKeyway: () => createKeyway(onStatus),
    addCenterMarks: () => addCenterMarks(onStatus)
  };
}
