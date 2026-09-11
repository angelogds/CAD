import {
  AcApDocManager,
  AcEdPromptPointOptions,
  AcEdPromptStatus
} from '@mlightcad/cad-simple-viewer';
import {
  AcDbRasterImage,
  AcDbRasterImageDef,
  AcGePoint2d,
  AcGePoint3d
} from '@mlightcad/data-model';

function database() {
  return AcApDocManager.instance?.curDocument?.database || null;
}

function modelSpace() {
  return database()?.tables?.blockTable?.modelSpace || null;
}

function managedPrefix(drawingId) {
  return `/desenho-tecnico/cad/${Number(drawingId)}/images/`;
}

function isManagedSource(source, drawingId) {
  return String(source || '').startsWith(managedPrefix(drawingId));
}

function extractAssetId(source, drawingId) {
  if (!isManagedSource(source, drawingId)) return null;
  const candidate = String(source).slice(managedPrefix(drawingId).length).split(/[?#]/)[0];
  return /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : null;
}

function imageSource(entity) {
  try { return String(entity?.imageFileName || ''); } catch (_error) { return ''; }
}

function rasterEntities() {
  const model = modelSpace();
  if (!model) return [];
  const result = [];
  for (const entity of model.newIterator()) {
    if (entity instanceof AcDbRasterImage) result.push(entity);
  }
  return result;
}

function worldSize(entity) {
  const scaleX = Number(entity?.scale?.x || 1);
  const scaleY = Number(entity?.scale?.y || 1);
  return {
    width: Math.abs(Number(entity?.width || 0) * scaleX),
    height: Math.abs(Number(entity?.height || 0) * scaleY),
  };
}

function currentLayer(entity) {
  return String(entity?.layer || entity?.layerName || '0');
}

function priorImageMap(cadData = {}) {
  return new Map((Array.isArray(cadData.objects) ? cadData.objects : [])
    .filter((object) => object?.type === 'image' && object.source)
    .map((object) => [String(object.source), object]));
}

export async function pickImageInsertionPoint(message = 'Clique no ponto de inserção da imagem') {
  const options = new AcEdPromptPointOptions(message);
  const result = await AcApDocManager.instance.editor.getPoint(options);
  return result.status === AcEdPromptStatus.OK ? result.value : null;
}

export function appendManagedRasterImage({
  drawingId,
  blob,
  source,
  assetId,
  point,
  width,
  height,
  pixelWidth,
  pixelHeight,
  originalName = '',
  mimeType = '',
  layer = '0',
  rotation = 0,
  brightness = 50,
  contrast = 50,
  fade = 0,
} = {}) {
  const db = database();
  const model = modelSpace();
  if (!db || !model) throw new Error('Banco do desenho MLightCAD indisponível.');
  if (!(blob instanceof Blob)) throw new Error('Conteúdo da imagem inválido.');
  if (!(Number(width) > 0) || !(Number(height) > 0)) throw new Error('Dimensões da imagem inválidas.');

  const imageDef = new AcDbRasterImageDef();
  imageDef.sourceFileName = String(source || '');
  imageDef.imageSize = new AcGePoint2d(Math.max(1, Number(pixelWidth || 1)), Math.max(1, Number(pixelHeight || 1)));
  imageDef.pixelSize = new AcGePoint2d(
    Number(width) / Math.max(1, Number(pixelWidth || 1)),
    Number(height) / Math.max(1, Number(pixelHeight || 1)),
  );
  const defKey = `CAD_IMG_${String(assetId || crypto.randomUUID()).replace(/[^a-z0-9]+/gi, '_')}`;
  db.objects.imageDefinition.setAt(defKey, imageDef);

  const raster = new AcDbRasterImage();
  raster.imageDefId = imageDef.objectId;
  raster.image = blob;
  raster.position = new AcGePoint3d(Number(point?.x || 0), Number(point?.y || 0), 0);
  raster.width = Number(width);
  raster.height = Number(height);
  raster.imageSize = new AcGePoint2d(Math.max(1, Number(pixelWidth || 1)), Math.max(1, Number(pixelHeight || 1)));
  raster.rotation = Number(rotation || 0);
  raster.brightness = Math.max(0, Math.min(100, Number(brightness ?? 50)));
  raster.contrast = Math.max(0, Math.min(100, Number(contrast ?? 50)));
  raster.fade = Math.max(0, Math.min(100, Number(fade ?? 0)));
  raster.isImageShown = true;
  if (typeof raster.setLayer === 'function') {
    try { raster.setLayer(layer); } catch (_error) { /* mantém camada padrão */ }
  }
  raster.__cadImageMeta = { drawingId: Number(drawingId), assetId, source, originalName, mimeType };
  model.appendEntity(raster);
  return raster;
}

async function blobForSource(source) {
  const response = await fetch(source, { credentials: 'same-origin', cache: 'force-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

export async function restoreManagedRasterImages({ drawingId, cadData = {} } = {}) {
  const id = Number(drawingId);
  if (!id || !database() || !modelSpace()) return { hydrated: 0, restored: 0, failed: 0 };

  const savedImages = (Array.isArray(cadData.objects) ? cadData.objects : []).filter((object) => object?.type === 'image' && isManagedSource(object.source, id));
  const bySource = new Map(rasterEntities().map((entity) => [imageSource(entity), entity]));
  let hydrated = 0;
  let restored = 0;
  let failed = 0;

  for (const entity of rasterEntities()) {
    const source = imageSource(entity);
    if (!source || !isManagedSource(source, id) || entity.image) continue;
    try {
      entity.image = await blobForSource(source);
      const prior = savedImages.find((item) => item.source === source);
      entity.__cadImageMeta = {
        drawingId: id,
        assetId: extractAssetId(source, id),
        source,
        originalName: prior?.originalName || prior?.metadata?.originalName || '',
        mimeType: prior?.mimeType || prior?.metadata?.mimeType || '',
      };
      hydrated += 1;
    } catch (_error) {
      failed += 1;
    }
  }

  for (const item of savedImages) {
    if (bySource.has(item.source)) continue;
    try {
      const blob = await blobForSource(item.source);
      appendManagedRasterImage({
        drawingId: id,
        blob,
        source: item.source,
        assetId: item.assetId || item.metadata?.assetId || extractAssetId(item.source, id),
        point: { x: Number(item.x || 0), y: Number(item.y || 0) },
        width: Math.max(1, Number(item.width || 200)),
        height: Math.max(1, Number(item.height || 150)),
        pixelWidth: Number(item.imageWidth || item.metadata?.imageWidth || 1),
        pixelHeight: Number(item.imageHeight || item.metadata?.imageHeight || 1),
        originalName: item.originalName || item.metadata?.originalName || '',
        mimeType: item.mimeType || item.metadata?.mimeType || '',
        layer: item.layer || '0',
        rotation: Number(item.rotation || 0),
        brightness: Number(item.brightness ?? 50),
        contrast: Number(item.contrast ?? 50),
        fade: Number(item.fade ?? 0),
      });
      restored += 1;
    } catch (_error) {
      failed += 1;
    }
  }

  if (hydrated || restored) AcApDocManager.instance.curView.zoomToFitDrawing();
  return { hydrated, restored, failed };
}

export function serializeManagedRasterImages({ drawingId, cadData = {} } = {}) {
  const id = Number(drawingId);
  const prior = priorImageMap(cadData);
  return rasterEntities().map((entity) => {
    const source = imageSource(entity) || entity.__cadImageMeta?.source || '';
    if (!isManagedSource(source, id)) return null;
    const previous = prior.get(source) || {};
    const meta = entity.__cadImageMeta || {};
    const size = worldSize(entity);
    const assetId = meta.assetId || previous.assetId || previous.metadata?.assetId || extractAssetId(source, id);
    return {
      id: String(entity.objectId || entity.handle || `image-${assetId}`),
      type: 'image',
      layer: currentLayer(entity),
      x: Number(entity.position?.x || 0),
      y: Number(entity.position?.y || 0),
      width: size.width,
      height: size.height,
      rotation: Number(entity.rotation || 0),
      assetId,
      source,
      originalName: meta.originalName || previous.originalName || previous.metadata?.originalName || '',
      mimeType: meta.mimeType || previous.mimeType || previous.metadata?.mimeType || '',
      imageWidth: Number(entity.imageSize?.x || previous.imageWidth || previous.metadata?.imageWidth || 0),
      imageHeight: Number(entity.imageSize?.y || previous.imageHeight || previous.metadata?.imageHeight || 0),
      brightness: Number(entity.brightness ?? 50),
      contrast: Number(entity.contrast ?? 50),
      fade: Number(entity.fade ?? 0),
      visible: entity.visibility !== false,
      style: { opacity: Math.max(0, Math.min(1, 1 - Number(entity.fade || 0) / 100)) },
      metadata: {
        ...(previous.metadata || {}),
        layer: currentLayer(entity),
        source: 'cad-raster-image',
        assetId,
        originalName: meta.originalName || previous.originalName || previous.metadata?.originalName || '',
        mimeType: meta.mimeType || previous.mimeType || previous.metadata?.mimeType || '',
      },
    };
  }).filter(Boolean);
}

export function patchMlightImageSerialization(app, { drawingId, cadData = {} } = {}) {
  if (!app || app.__cadImageSerializationPatched) return;
  const originalSerialize = app.serializeForSave.bind(app);
  app.serializeForSave = (baseCadData = cadData) => {
    const payload = originalSerialize(baseCadData);
    const images = serializeManagedRasterImages({ drawingId, cadData: baseCadData });
    payload.schemaVersion = Math.max(4, Number(payload.schemaVersion || 0));
    payload.objects = [
      ...(Array.isArray(payload.objects) ? payload.objects.filter((object) => object?.type !== 'image') : []),
      ...images,
    ];
    return payload;
  };
  app.__cadImageSerializationPatched = true;
}
