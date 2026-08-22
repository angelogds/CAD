import { AcApDocManager } from '@mlightcad/cad-simple-viewer';
import {
  AcDbAlignedDimension,
  AcDbCircle,
  AcDbDataGenerator,
  AcDbEllipse,
  AcDbLayerTableRecord,
  AcDbLine,
  AcDbPolyline
} from '@mlightcad/data-model';
import {
  TECHNICAL_LAYERS,
  TECHNICAL_LAYER_NAMES,
  isNonModelLayer,
  planAutoDimensions
} from './mlightcad-auto-dimension-v3.logic.mjs';

const AUTO_DIM_PREFIX = '*AD';
const AUTO_DIM_V3_PREFIX = '*ADV3_';

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function p3(point) {
  return { x: asNumber(point?.x), y: asNumber(point?.y), z: asNumber(point?.z) };
}

function getDocument() {
  const document = AcApDocManager.instance?.curDocument;
  if (!document?.database) throw new Error('Documento MLightCAD não está disponível.');
  return document;
}

function getDb() {
  return getDocument().database;
}

function getModel() {
  return getDb().tables.blockTable.modelSpace;
}

function polylinePoints(entity) {
  return Array.from({ length: entity.numberOfVertices || 0 }, (_, index) => {
    const point = entity.getPoint2dAt(index);
    return { x: point.x, y: point.y };
  });
}

function snapshotDrawing() {
  const circles = [];
  const lines = [];
  const polylines = [];
  const ellipses = [];
  let index = 0;
  for (const entity of getModel().newIterator()) {
    index += 1;
    const layer = String(entity?.layer || '0').trim();
    if (isNonModelLayer(layer)) continue;
    const id = String(entity?.objectId || entity?.handle || `entity-${index}`);
    if (entity instanceof AcDbCircle) {
      circles.push({ id, layer, cx: entity.center.x, cy: entity.center.y, radius: Math.abs(entity.radius) });
    } else if (entity instanceof AcDbLine) {
      lines.push({
        id,
        layer,
        x1: entity.startPoint.x,
        y1: entity.startPoint.y,
        x2: entity.endPoint.x,
        y2: entity.endPoint.y
      });
    } else if (entity instanceof AcDbPolyline) {
      polylines.push({ id, layer, points: polylinePoints(entity), closed: Boolean(entity.closed) });
    } else if (entity instanceof AcDbEllipse) {
      const axis = entity.majorAxis || { x: 1, y: 0 };
      ellipses.push({
        id,
        layer,
        cx: entity.center.x,
        cy: entity.center.y,
        majorRadius: Math.abs(entity.majorRadius),
        minorRadius: Math.abs(entity.minorRadius),
        rotation: Math.atan2(axis.y, axis.x)
      });
    }
  }
  return { circles, lines, polylines, ellipses };
}

function ensureTechnicalLayers() {
  const db = getDb();
  const table = db.tables.layerTable;
  const created = [];
  const existed = [];
  for (const name of TECHNICAL_LAYER_NAMES) {
    if (table.getAt(name)) {
      existed.push(name);
      continue;
    }
    table.add(new AcDbLayerTableRecord({ name }));
    created.push(name);
  }
  return { created, existed, names: [...TECHNICAL_LAYER_NAMES] };
}

function ensureArrowBlock(db) {
  try {
    new AcDbDataGenerator(db).createArrowBlock();
  } catch (_error) {
    // O bloco padrão pode já existir; neste caso seguimos reutilizando-o.
  }
}

function nextBlockName(db) {
  let max = 0;
  for (const block of db.tables.blockTable.newIterator()) {
    const name = String(block?.name || '');
    if (!name.startsWith(AUTO_DIM_V3_PREFIX)) continue;
    const number = Number(name.slice(AUTO_DIM_V3_PREFIX.length));
    if (Number.isInteger(number) && number > max) max = number;
  }
  return `${AUTO_DIM_V3_PREFIX}${max + 1}`;
}

function appendDimension(spec) {
  const db = getDb();
  ensureArrowBlock(db);
  const dimension = new AcDbAlignedDimension(p3(spec.p1), p3(spec.p2), p3(spec.dimLinePoint));
  dimension.rotation = Math.atan2(
    asNumber(spec.p2?.y) - asNumber(spec.p1?.y),
    asNumber(spec.p2?.x) - asNumber(spec.p1?.x)
  );
  dimension.layer = TECHNICAL_LAYERS.DIMENSIONS;
  if (spec.label) dimension.dimensionText = String(spec.label);
  const blockName = nextBlockName(db);
  db.tables.blockTable.add(dimension.createDimBlock(blockName));
  dimension.dimBlockId = blockName;
  db.tables.blockTable.modelSpace.appendEntity(dimension);
  return dimension;
}

function clearAutoDimensions() {
  const db = getDb();
  const view = AcApDocManager.instance.curView;
  const model = db.tables.blockTable.modelSpace;
  const entities = [];
  const blocks = new Set();
  for (const entity of model.newIterator()) {
    const blockName = typeof entity?.dimBlockId === 'string' ? entity.dimBlockId : '';
    if (!blockName.startsWith(AUTO_DIM_PREFIX)) continue;
    entities.push(entity);
    blocks.add(blockName);
  }
  for (const entity of entities) {
    try { entity.erase(); } catch (_error) {}
    try { view?.removeEntity(entity); } catch (_error) {}
  }
  for (const blockName of blocks) {
    try { db.tables.blockTable.remove(blockName); } catch (_error) {}
  }
  return entities.length;
}

function refreshView() {
  try { AcApDocManager.instance.curView.zoomToFitDrawing(); } catch (_error) {}
}

function autoDimensionAll(onStatus = () => {}) {
  const snapshot = snapshotDrawing();
  const plan = planAutoDimensions(snapshot);
  if (!plan.bounds || plan.dimensions.length === 0) {
    onStatus('AUTO COTAR V3: não há geometria de fabricação compatível para cotar.');
    return { count: 0, planned: 0, summary: plan.summary || { total: 0 } };
  }

  const layers = ensureTechnicalLayers();
  const cleared = clearAutoDimensions();
  let count = 0;
  const failures = [];
  for (const spec of plan.dimensions) {
    try {
      appendDimension(spec);
      count += 1;
    } catch (error) {
      failures.push({ semantic: spec.semantic, error: error?.message || String(error) });
    }
  }
  refreshView();

  const parts = [];
  if (plan.summary['shaft-length']) parts.push('eixo escalonado');
  if (plan.summary['bolt-circle-pcd']) parts.push('PCD');
  if (plan.summary['circle-diameter']) parts.push('diâmetros');
  if (plan.summary['profile-width'] || plan.summary['profile-height']) parts.push('perfis');
  const detail = parts.length ? ` • ${parts.join(', ')}` : '';
  onStatus(`AUTO COTAR V3: ${count} cota(s) organizadas em ${TECHNICAL_LAYERS.DIMENSIONS}${detail}.`);
  return {
    count,
    planned: plan.dimensions.length,
    cleared,
    layersCreated: layers.created,
    failures,
    summary: plan.summary,
    version: 3
  };
}

export function createMlightAutoDimensionV3Tools({ onStatus = () => {} } = {}) {
  getDb();
  return {
    version: 3,
    technicalLayers: { ...TECHNICAL_LAYERS },
    ensureTechnicalLayers() {
      const result = ensureTechnicalLayers();
      onStatus(result.created.length
        ? `Layers técnicos criados: ${result.created.join(', ')}.`
        : 'Layers técnicos de fabricação já estão disponíveis.');
      return { count: result.created.length, ...result };
    },
    clearAutoDimensions() {
      const count = clearAutoDimensions();
      if (count > 0) refreshView();
      onStatus(count > 0 ? `${count} cota(s) automática(s) removida(s).` : 'Não há cotas automáticas para remover.');
      return { count };
    },
    autoDimensionAll: () => autoDimensionAll(onStatus),
    snapshotDrawing,
    planCurrentDrawing() {
      return planAutoDimensions(snapshotDrawing());
    }
  };
}
