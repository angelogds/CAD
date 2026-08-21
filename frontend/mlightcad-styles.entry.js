import { AcApDocManager } from '@mlightcad/cad-simple-viewer';
import {
  AcCmColor,
  AcDbDimension,
  AcDbLinetypeTableRecord
} from '@mlightcad/data-model';

const DIM_LAYER = 'FAB_COTAS';
const BY_LAYER = 'ByLayer';
const BY_BLOCK = 'ByBlock';

const LINE_TYPES = [
  { name: 'Continuous', label: 'Contínua', description: 'Linha contínua', totalPatternLength: 0, pattern: [] },
  { name: 'DASHED', label: 'Tracejada', description: 'Tracejada técnica', totalPatternLength: 9, pattern: [6, -3] },
  { name: 'HIDDEN', label: 'Oculta', description: 'Linha oculta', totalPatternLength: 5, pattern: [3, -2] },
  { name: 'CENTER', label: 'Centro', description: 'Linha de centro', totalPatternLength: 21, pattern: [12, -3, 3, -3] },
  { name: 'DASHDOT', label: 'Traço ponto', description: 'Traço ponto', totalPatternLength: 12, pattern: [8, -2, 0, -2] }
];

const LINE_WEIGHTS = [
  { value: -1, label: 'Por camada' },
  { value: 13, label: '0,13 mm' },
  { value: 18, label: '0,18 mm' },
  { value: 25, label: '0,25 mm' },
  { value: 35, label: '0,35 mm' },
  { value: 50, label: '0,50 mm' },
  { value: 70, label: '0,70 mm' },
  { value: 100, label: '1,00 mm' }
];

const DEFAULT_CURRENT = {
  layer: '0',
  colorMode: 'bylayer',
  color: '#ffffff',
  lineType: BY_LAYER,
  lineWeight: -1,
  lineTypeScale: 1
};

const DEFAULT_DIMENSION = {
  layer: DIM_LAYER,
  colorMode: 'rgb',
  color: '#ff3b30',
  lineType: 'Continuous',
  lineWeight: 18,
  lineTypeScale: 1
};

function doc() {
  const current = AcApDocManager.instance?.curDocument;
  if (!current?.database) throw new Error('Documento MLightCAD não disponível.');
  return current;
}

function view() {
  return AcApDocManager.instance?.curView;
}

function db() {
  return doc().database;
}

function modelSpace() {
  return db().tables.blockTable.modelSpace;
}

function cloneStyle(style, fallback) {
  const source = style && typeof style === 'object' ? style : {};
  return {
    ...fallback,
    ...source,
    lineWeight: Number.isFinite(Number(source.lineWeight)) ? Number(source.lineWeight) : fallback.lineWeight,
    lineTypeScale: Number.isFinite(Number(source.lineTypeScale)) && Number(source.lineTypeScale) > 0
      ? Number(source.lineTypeScale)
      : fallback.lineTypeScale
  };
}

function toColor(style, inheritance = BY_LAYER) {
  const color = new AcCmColor();
  if (style?.colorMode === 'rgb' && /^#[0-9a-f]{6}$/i.test(String(style.color || ''))) {
    return color.setRGBFromCss(style.color);
  }
  if (inheritance === BY_BLOCK) return color.setByBlock();
  return color.setByLayer();
}

function ensureLineTypes(database) {
  for (const spec of LINE_TYPES) {
    if (database.tables.linetypeTable.getAt(spec.name)) continue;
    database.tables.linetypeTable.add(new AcDbLinetypeTableRecord({
      name: spec.name,
      standardFlag: 0,
      description: spec.description,
      totalPatternLength: spec.totalPatternLength,
      pattern: spec.pattern.map((elementLength) => ({ elementLength, elementTypeFlag: 0 }))
    }));
  }
}

function ensureLayer(layerName) {
  const currentDoc = doc();
  const name = String(layerName || '0').trim() || '0';
  if (!currentDoc.database.tables.layerTable.getAt(name)) currentDoc.layerService.createLayers([name]);
  return name;
}

function setLayerStyle(layerName, style) {
  const currentDoc = doc();
  const name = ensureLayer(layerName);
  ensureLineTypes(currentDoc.database);
  currentDoc.layerService.setLayerColor(name, toColor(style));
  currentDoc.layerService.setLayerLinetype(name, style.lineType === BY_LAYER ? 'Continuous' : style.lineType || 'Continuous');
  currentDoc.layerService.setLayerLineWeight(name, Number(style.lineWeight) === -1 ? 18 : Number(style.lineWeight));
  return name;
}

function listLayers() {
  const result = [];
  for (const layer of db().tables.layerTable.newIterator()) {
    if (layer?.name) result.push(String(layer.name));
  }
  return [...new Set(result)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function listLineTypes() {
  ensureLineTypes(db());
  return [
    { name: BY_LAYER, label: 'Por camada' },
    ...LINE_TYPES.map(({ name, label }) => ({ name, label }))
  ];
}

function setCurrentStyle(style) {
  const database = db();
  ensureLineTypes(database);
  const normalized = cloneStyle(style, DEFAULT_CURRENT);
  const layer = ensureLayer(normalized.layer);
  doc().layerService.setCurrentLayer(layer);
  database.clayer = layer;
  database.cecolor = toColor(normalized);
  database.celtype = normalized.lineType || BY_LAYER;
  database.celweight = Number(normalized.lineWeight);
  database.celtscale = Number(normalized.lineTypeScale) || 1;
  return { ...normalized, layer };
}

function styleDimensionBlock(dimension, style) {
  const blockName = typeof dimension?.dimBlockId === 'string' ? dimension.dimBlockId : '';
  if (!blockName) return;
  const block = db().tables.blockTable.getAt(blockName);
  if (!block?.newIterator) return;
  for (const child of block.newIterator()) {
    try {
      child.layer = '0';
      child.color = toColor(style, BY_BLOCK);
      child.lineType = BY_BLOCK;
      child.lineWeight = -2;
      child.linetypeScale = Number(style.lineTypeScale) || 1;
    } catch (_error) {}
  }
}

function applyDimensionStyleToEntity(entity, style) {
  if (!(entity instanceof AcDbDimension) && String(entity?.dxfTypeName || '').toUpperCase() !== 'DIMENSION') return false;
  const dimensionStyle = cloneStyle(style, DEFAULT_DIMENSION);
  const layer = setLayerStyle(dimensionStyle.layer || DIM_LAYER, dimensionStyle);
  entity.layer = layer;
  entity.color = toColor({ colorMode: 'bylayer' });
  entity.lineType = BY_LAYER;
  entity.lineWeight = -1;
  entity.linetypeScale = Number(dimensionStyle.lineTypeScale) || 1;
  styleDimensionBlock(entity, dimensionStyle);
  return true;
}

function styleAllDimensions(style) {
  const currentDoc = doc();
  const changed = [];
  currentDoc.entityService.runEntityEdit(() => {
    for (const entity of modelSpace().newIterator()) {
      if (!applyDimensionStyleToEntity(entity, style)) continue;
      changed.push(entity);
    }
  });
  if (changed.length) view()?.updateEntity?.(changed);
  return changed.length;
}

function installDimensionAppendHook(getDimensionStyle) {
  const model = modelSpace();
  if (model.__campoGadoStyleHook) return;
  const originalAppend = model.appendEntity.bind(model);
  model.appendEntity = (input) => {
    const entities = Array.isArray(input) ? input : [input];
    for (const entity of entities) {
      try { applyDimensionStyleToEntity(entity, getDimensionStyle()); } catch (error) { console.warn('[CAD][STYLE] Falha ao estilizar cota nova:', error); }
    }
    return originalAppend(input);
  };
  model.__campoGadoStyleHook = true;
}

function applyStyleToSelection(style) {
  const currentDoc = doc();
  const ids = Array.from(view()?.selectionSet?.ids || []);
  if (!ids.length) return { count: 0, message: 'Selecione um ou mais objetos antes de aplicar o estilo.' };
  const normalized = cloneStyle(style, DEFAULT_CURRENT);
  ensureLineTypes(currentDoc.database);
  if (normalized.layer && normalized.layer !== '__KEEP__') ensureLayer(normalized.layer);
  const changed = [];
  currentDoc.entityService.runEntityEdit(() => {
    for (const id of ids) {
      const entity = currentDoc.database.openEntityForWrite(id);
      if (!entity) continue;
      if (normalized.layer && normalized.layer !== '__KEEP__') entity.layer = normalized.layer;
      entity.color = toColor(normalized);
      entity.lineType = normalized.lineType || BY_LAYER;
      entity.lineWeight = Number(normalized.lineWeight);
      entity.linetypeScale = Number(normalized.lineTypeScale) || 1;
      if (entity instanceof AcDbDimension || String(entity.dxfTypeName || '').toUpperCase() === 'DIMENSION') {
        styleDimensionBlock(entity, normalized);
      }
      changed.push(entity);
    }
  });
  if (changed.length) view()?.updateEntity?.(changed);
  return { count: changed.length, message: `${changed.length} objeto(s) atualizado(s).` };
}

function resetSelectionByLayer() {
  const currentDoc = doc();
  const ids = Array.from(view()?.selectionSet?.ids || []);
  if (!ids.length) return { count: 0, message: 'Selecione um ou mais objetos.' };
  const changed = [];
  currentDoc.entityService.runEntityEdit(() => {
    for (const id of ids) {
      const entity = currentDoc.database.openEntityForWrite(id);
      if (!entity) continue;
      entity.color = new AcCmColor().setByLayer();
      entity.lineType = BY_LAYER;
      entity.lineWeight = -1;
      entity.linetypeScale = 1;
      changed.push(entity);
    }
  });
  if (changed.length) view()?.updateEntity?.(changed);
  return { count: changed.length, message: `${changed.length} objeto(s) retornado(s) para BYLAYER.` };
}

export function createMlightStyleTools({ cadData = {}, onStatus } = {}) {
  ensureLineTypes(db());
  cadData.manufacturing = { ...(cadData.manufacturing || {}) };
  const saved = cadData.manufacturing.styleSettings || {};
  let currentStyle = cloneStyle(saved.current, DEFAULT_CURRENT);
  let dimensionStyle = cloneStyle(saved.dimension, DEFAULT_DIMENSION);

  try {
    const local = JSON.parse(localStorage.getItem('cad2d.currentStyle') || 'null');
    if (!saved.current && local) currentStyle = cloneStyle(local, DEFAULT_CURRENT);
  } catch (_error) {}

  const persist = () => {
    cadData.manufacturing = {
      ...(cadData.manufacturing || {}),
      styleSettings: { current: currentStyle, dimension: dimensionStyle }
    };
  };

  const status = (message) => onStatus?.(message);
  setLayerStyle(DIM_LAYER, dimensionStyle);
  installDimensionAppendHook(() => dimensionStyle);
  const existing = styleAllDimensions(dimensionStyle);
  persist();

  return {
    dimensionLayer: DIM_LAYER,
    lineWeights: LINE_WEIGHTS,
    getCurrentStyle: () => ({ ...currentStyle }),
    getDimensionStyle: () => ({ ...dimensionStyle }),
    listLayers,
    listLineTypes,
    setCurrentStyle(style) {
      currentStyle = setCurrentStyle(style);
      persist();
      try { localStorage.setItem('cad2d.currentStyle', JSON.stringify(currentStyle)); } catch (_error) {}
      status(`Estilo atual: ${currentStyle.layer} • ${currentStyle.lineType}.`);
      return { ...currentStyle };
    },
    setDimensionStyle(style, applyExisting = true) {
      dimensionStyle = cloneStyle(style, DEFAULT_DIMENSION);
      dimensionStyle.layer = DIM_LAYER;
      setLayerStyle(DIM_LAYER, dimensionStyle);
      const count = applyExisting ? styleAllDimensions(dimensionStyle) : 0;
      persist();
      status(`Cotas: ${dimensionStyle.color} • ${dimensionStyle.lineType}${applyExisting ? ` • ${count} atualizada(s)` : ''}.`);
      return { style: { ...dimensionStyle }, count };
    },
    applyStyleToSelection(style) {
      const result = applyStyleToSelection(style);
      status(result.message);
      return result;
    },
    resetSelectionByLayer() {
      const result = resetSelectionByLayer();
      status(result.message);
      return result;
    },
    refreshDimensions() {
      const count = styleAllDimensions(dimensionStyle);
      status(`${count} cota(s) atualizada(s) com o estilo técnico.`);
      return count;
    },
    bootstrapExistingDimensions: existing
  };
}
