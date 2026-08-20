import {
  AcApDocManager,
  AcEdOpenMode,
  AcEdPromptPointOptions,
  AcEdPromptStatus,
  acedApplyUiTheme
} from '@mlightcad/cad-simple-viewer';
import { registerSimpleUiPlugin } from '@mlightcad/cad-simple-ui-plugin/register';
import {
  AcDbArc,
  AcDbCircle,
  AcDbEllipse,
  AcDbLine,
  AcDbMText,
  AcDbPolyline,
  AcGePoint2d
} from '@mlightcad/data-model';

export const MLIGHTCAD_VERSION = '1.6.1';

const DEFAULT_LAYER = '0';

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanLayer(value) {
  const name = String(value || DEFAULT_LAYER).trim();
  return name || DEFAULT_LAYER;
}

function dxfPair(code, value) {
  return `${code}\n${value}\n`;
}

function colorToAci(_color, fallback = 7) {
  return fallback;
}

function buildLayerTable(cadData = {}) {
  const names = new Set([DEFAULT_LAYER]);
  Object.keys(cadData.layers || {}).forEach((name) => names.add(cleanLayer(name)));
  [...(cadData.objects || []), ...(cadData.dimensions || [])].forEach((obj) => names.add(cleanLayer(obj.layer || obj.metadata?.layer)));
  let out = dxfPair(0, 'TABLE') + dxfPair(2, 'LAYER') + dxfPair(70, names.size);
  for (const name of names) {
    const cfg = cadData.layers?.[name] || {};
    out += dxfPair(0, 'LAYER');
    out += dxfPair(2, name);
    out += dxfPair(70, cfg.visible === false ? 1 : 0);
    out += dxfPair(62, colorToAci(cfg.color, 7));
    out += dxfPair(6, 'CONTINUOUS');
    out += dxfPair(370, -1);
  }
  out += dxfPair(0, 'ENDTAB');
  return out;
}

function appendLine(out, obj, x1, y1, x2, y2) {
  out.push(
    dxfPair(0, 'LINE') +
    dxfPair(8, cleanLayer(obj.layer || obj.metadata?.layer)) +
    dxfPair(10, asNumber(x1)) + dxfPair(20, asNumber(y1)) + dxfPair(30, 0) +
    dxfPair(11, asNumber(x2)) + dxfPair(21, asNumber(y2)) + dxfPair(31, 0)
  );
}

function appendPolyline(out, obj, points, closed = false) {
  const valid = (points || []).map((p) => ({ x: asNumber(p.x), y: asNumber(p.y) }));
  if (valid.length < 2) return;
  let chunk = dxfPair(0, 'LWPOLYLINE') +
    dxfPair(8, cleanLayer(obj.layer || obj.metadata?.layer)) +
    dxfPair(90, valid.length) + dxfPair(70, closed ? 1 : 0);
  valid.forEach((p) => { chunk += dxfPair(10, p.x) + dxfPair(20, p.y); });
  out.push(chunk);
}

function appendLegacyObject(out, obj = {}) {
  const type = String(obj.type || '').toLowerCase();
  const g = obj.geometry || {};
  if (type === 'line' || type === 'centerline') {
    appendLine(out, obj, g.x1 ?? obj.x, g.y1 ?? obj.y, g.x2 ?? obj.x2, g.y2 ?? obj.y2);
    return;
  }
  if (type === 'circle') {
    const cx = g.cx ?? obj.x;
    const cy = g.cy ?? obj.y;
    const radius = Math.abs(asNumber(g.radius ?? obj.radius));
    if (!(radius > 0)) return;
    out.push(dxfPair(0, 'CIRCLE') + dxfPair(8, cleanLayer(obj.layer || obj.metadata?.layer)) + dxfPair(10, asNumber(cx)) + dxfPair(20, asNumber(cy)) + dxfPair(30, 0) + dxfPair(40, radius));
    return;
  }
  if (type === 'arc') {
    const radius = Math.abs(asNumber(g.radius ?? obj.radius));
    if (!(radius > 0)) return;
    const start = asNumber(g.startAngle ?? obj.startAngle) * 180 / Math.PI;
    const end = asNumber(g.endAngle ?? obj.endAngle) * 180 / Math.PI;
    out.push(dxfPair(0, 'ARC') + dxfPair(8, cleanLayer(obj.layer || obj.metadata?.layer)) + dxfPair(10, asNumber(g.cx ?? obj.cx ?? obj.x)) + dxfPair(20, asNumber(g.cy ?? obj.cy ?? obj.y)) + dxfPair(30, 0) + dxfPair(40, radius) + dxfPair(50, start) + dxfPair(51, end));
    return;
  }
  if (type === 'rect') {
    const x = asNumber(g.x ?? obj.x);
    const y = asNumber(g.y ?? obj.y);
    const w = asNumber(g.width ?? obj.width);
    const h = asNumber(g.height ?? obj.height);
    appendPolyline(out, obj, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], true);
    return;
  }
  if (type === 'polyline') {
    appendPolyline(out, obj, g.points || obj.points || [], Boolean(g.closed ?? obj.closed));
    return;
  }
  if (type === 'text') {
    const text = String(g.text ?? obj.text ?? '').replace(/[\r\n]+/g, ' ');
    if (!text) return;
    out.push(dxfPair(0, 'TEXT') + dxfPair(8, cleanLayer(obj.layer || obj.metadata?.layer)) + dxfPair(10, asNumber(g.x ?? obj.x)) + dxfPair(20, asNumber(g.y ?? obj.y)) + dxfPair(30, 0) + dxfPair(40, Math.max(1, asNumber(g.size ?? obj.size, 14))) + dxfPair(1, text));
    return;
  }
  if (type === 'ellipse') {
    const cx = asNumber(g.cx ?? obj.cx ?? obj.x);
    const cy = asNumber(g.cy ?? obj.cy ?? obj.y);
    const rx = Math.abs(asNumber(g.rx ?? g.majorRadius ?? obj.rx ?? obj.radiusX));
    const ry = Math.abs(asNumber(g.ry ?? g.minorRadius ?? obj.ry ?? obj.radiusY));
    if (!(rx > 0 && ry > 0)) return;
    const rotation = asNumber(g.rotation ?? obj.rotation);
    const axisX = Math.cos(rotation) * rx;
    const axisY = Math.sin(rotation) * rx;
    out.push(dxfPair(0, 'ELLIPSE') + dxfPair(8, cleanLayer(obj.layer || obj.metadata?.layer)) + dxfPair(10, cx) + dxfPair(20, cy) + dxfPair(30, 0) + dxfPair(11, axisX) + dxfPair(21, axisY) + dxfPair(31, 0) + dxfPair(40, ry / rx) + dxfPair(41, 0) + dxfPair(42, Math.PI * 2));
    return;
  }
  if (type === 'spline') {
    const points = g.points || g.controlPoints || obj.points || obj.controlPoints || [];
    appendPolyline(out, obj, points, Boolean(g.closed ?? obj.closed));
    return;
  }
  if (type === 'shaft') {
    const origin = g.origin || { x: 0, y: 0 };
    const horizontal = g.orientation !== 'vertical';
    let cursorX = asNumber(origin.x);
    let cursorY = asNumber(origin.y);
    const startX = cursorX;
    const startY = cursorY;
    for (const segment of g.segments || []) {
      const length = Math.abs(asNumber(segment.length));
      const diameter = Math.abs(asNumber(segment.diameter));
      if (!(length > 0 && diameter > 0)) continue;
      if (horizontal) {
        appendPolyline(out, obj, [
          { x: cursorX, y: cursorY - diameter / 2 }, { x: cursorX + length, y: cursorY - diameter / 2 },
          { x: cursorX + length, y: cursorY + diameter / 2 }, { x: cursorX, y: cursorY + diameter / 2 }
        ], true);
        cursorX += length;
      } else {
        appendPolyline(out, obj, [
          { x: cursorX - diameter / 2, y: cursorY }, { x: cursorX + diameter / 2, y: cursorY },
          { x: cursorX + diameter / 2, y: cursorY + length }, { x: cursorX - diameter / 2, y: cursorY + length }
        ], true);
        cursorY += length;
      }
    }
    appendLine(out, { ...obj, layer: obj.layer || 'eixos' }, startX, startY, cursorX, cursorY);
    return;
  }
  if (type === 'dimension') {
    const p1 = g.p1;
    const p2 = g.p2;
    if (p1 && p2) appendLine(out, { ...obj, layer: obj.layer || 'cotas' }, p1.x, p1.y, p2.x, p2.y);
    const tp = g.textPoint || p2 || p1;
    if (tp && g.label) appendLegacyObject(out, { type: 'text', layer: obj.layer || 'cotas', x: tp.x, y: tp.y, text: g.label, size: 8 });
  }
}

export function legacyCadToDxf(cadData = {}) {
  const entities = [];
  [...(cadData.objects || []), ...(cadData.dimensions || [])].forEach((obj) => appendLegacyObject(entities, obj));
  return [
    dxfPair(0, 'SECTION'), dxfPair(2, 'HEADER'), dxfPair(9, '$ACADVER'), dxfPair(1, 'AC1015'), dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'), dxfPair(2, 'TABLES'),
    dxfPair(0, 'TABLE'), dxfPair(2, 'LTYPE'), dxfPair(70, 1), dxfPair(0, 'LTYPE'), dxfPair(2, 'CONTINUOUS'), dxfPair(70, 0), dxfPair(3, 'Solid line'), dxfPair(72, 65), dxfPair(73, 0), dxfPair(40, 0), dxfPair(0, 'ENDTAB'),
    buildLayerTable(cadData), dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'), dxfPair(2, 'BLOCKS'), dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'), dxfPair(2, 'ENTITIES'), entities.join(''), dxfPair(0, 'ENDSEC'), dxfPair(0, 'EOF')
  ].join('');
}

function latestMlightSnapshot(cadData = {}) {
  const history = Array.isArray(cadData.history) ? cadData.history : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item && typeof item === 'object' && item.kind === 'mlightcad-document' && typeof item.dxfBase64 === 'string' && item.dxfBase64) return item;
  }
  return null;
}

function withMlightSnapshot(baseCadData, dxfBase64, stats) {
  const history = (Array.isArray(baseCadData.history) ? baseCadData.history : [])
    .filter((item) => !(item && typeof item === 'object' && item.kind === 'mlightcad-document'))
    .slice(-90);
  history.push({
    kind: 'mlightcad-document',
    version: MLIGHTCAD_VERSION,
    dxfBase64,
    stats,
    savedAt: new Date().toISOString()
  });
  return history;
}

function decodeBase64ToBuffer(base64) {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function encodeBytesToBase64(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) binary += String.fromCharCode(...data.subarray(i, i + chunk));
  return btoa(binary);
}

function dxfOutputBytes(database) {
  const output = database.dxfOut(undefined, 6);
  return typeof output === 'string' ? new TextEncoder().encode(output) : new Uint8Array(output);
}

function entityLayer(entity) {
  return cleanLayer(entity?.layer || entity?.layerName || DEFAULT_LAYER);
}

function mirrorDatabase(database) {
  const objects = [];
  const unsupported = {};
  const model = database.tables.blockTable.modelSpace;
  let index = 0;
  for (const entity of model.newIterator()) {
    index += 1;
    const id = String(entity.handle || entity.objectId?.handle || `mlight-${index}`);
    const layer = entityLayer(entity);
    if (entity instanceof AcDbLine) {
      objects.push({ id, type: 'line', layer, x: entity.startPoint.x, y: entity.startPoint.y, x2: entity.endPoint.x, y2: entity.endPoint.y });
    } else if (entity instanceof AcDbCircle) {
      objects.push({ id, type: 'circle', layer, x: entity.center.x, y: entity.center.y, radius: entity.radius });
    } else if (entity instanceof AcDbArc) {
      objects.push({ id, type: 'arc', layer, geometry: { cx: entity.center.x, cy: entity.center.y, radius: entity.radius, startAngle: entity.startAngle, endAngle: entity.endAngle, ccw: entity.normal?.z !== -1 } });
    } else if (entity instanceof AcDbPolyline) {
      const points = Array.from({ length: entity.numberOfVertices }, (_, i) => {
        const p = entity.getPoint2dAt(i);
        return { x: p.x, y: p.y };
      });
      objects.push({ id, type: 'polyline', layer, points, closed: Boolean(entity.closed) });
    } else if (entity instanceof AcDbMText) {
      const p = entity.location || { x: 0, y: 0 };
      objects.push({ id, type: 'text', layer, x: p.x, y: p.y, text: entity.contents || '', size: entity.textHeight || entity.height || 14 });
    } else if (entity instanceof AcDbEllipse) {
      const axis = entity.majorAxis || { x: 1, y: 0 };
      objects.push({ id, type: 'ellipse', layer, geometry: { cx: entity.center.x, cy: entity.center.y, majorRadius: entity.majorRadius, minorRadius: entity.minorRadius, rotation: Math.atan2(axis.y, axis.x), startAngle: entity.startAngle, endAngle: entity.endAngle } });
    } else {
      const key = String(entity.dxfTypeName || entity.type || entity.constructor?.name || 'UNKNOWN');
      unsupported[key] = (unsupported[key] || 0) + 1;
    }
  }
  return { objects, unsupported, total: index };
}

function createToolbarItems() {
  const item = (id, label, command) => ({ id, label, command, requiresDocument: true });
  const group = (id, label, children) => ({ id, label, requiresDocument: true, childrenUi: 'sticky-toolbar', children });
  return [
    { preset: 'select' },
    { preset: 'pan' },
    { preset: 'zoom-extent' },
    { preset: 'layer' },
    group('draw-2d', 'Desenhar', [
      item('line', 'Linha', 'line'), item('pline', 'Polilinha', 'pline'), item('circle', 'Círculo', 'circle'),
      item('arc', 'Arco', 'arc'), item('rectang', 'Retângulo', 'rectang'), item('ellipse', 'Elipse', 'ellipse'),
      item('spline', 'Spline', 'spline'), item('hatch', 'Hachura', '-hatch')
    ]),
    group('modify-2d', 'Modificar', [
      item('move', 'Mover', 'move'), item('copy', 'Copiar', 'copy'), item('rotate', 'Rotacionar', 'rotate'),
      item('offset', 'Offset', 'offset'), item('erase', 'Apagar', 'erase')
    ]),
    group('annotate-2d', 'Anotar', [
      item('dimlinear', 'Cota linear', 'dimlinear'), item('undo', 'Desfazer', 'undo'), item('redo', 'Refazer', 'redo')
    ]),
    { preset: 'measure' },
    { preset: 'switch-bg' },
    { preset: 'theme' }
  ];
}

async function acquirePoint(message) {
  const options = new AcEdPromptPointOptions(message);
  const result = await AcApDocManager.instance.editor.getPoint(options);
  return result.status === AcEdPromptStatus.OK ? result.value : null;
}

function appendCircle(model, center, radius) {
  const entity = new AcDbCircle({ x: center.x, y: center.y, z: 0 }, radius);
  model.appendEntity(entity);
  return entity;
}

function appendRect(model, x, y, width, height) {
  const poly = new AcDbPolyline();
  const pts = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  pts.forEach((p, i) => poly.addVertexAt(i, new AcGePoint2d(p.x, p.y)));
  poly.closed = true;
  model.appendEntity(poly);
  return poly;
}

export async function createMlightCadWorkbench({ container, host = container, cadData = {}, fileName = 'desenho.dxf', onStatus = () => {} } = {}) {
  if (!container) throw new Error('Container MLightCAD não informado.');
  try {
    acedApplyUiTheme('dark', host);
    AcApDocManager.createInstance({
      container,
      busyIndicatorHost: host,
      autoResize: true,
      useMainThreadDraw: true,
      openDocumentDefaults: { mode: AcEdOpenMode.Write, progressiveRendering: false, sysVars: { lwdisplay: false } }
    });

    await registerSimpleUiPlugin(AcApDocManager.instance.pluginManager, {
      host,
      dockPanel: { defaultSide: 'left', defaultOpen: true, defaultWidth: 300 },
      toolbar: { placement: 'top', items: createToolbarItems(), collapsible: true, defaultCollapsed: false }
    });

    const snapshot = latestMlightSnapshot(cadData);
    const openBuffer = snapshot?.dxfBase64
      ? decodeBase64ToBuffer(snapshot.dxfBase64)
      : new TextEncoder().encode(legacyCadToDxf(cadData)).buffer;

    const opened = await AcApDocManager.instance.openDocument(fileName, openBuffer, {
      mode: AcEdOpenMode.Write,
      progressiveRendering: false,
      minimumChunkSize: 1000,
      sysVars: { lwdisplay: false }
    });
    if (!opened) throw new Error('MLightCAD não conseguiu abrir o desenho DXF interno.');
    AcApDocManager.instance.curView.zoomToFitDrawing();
    onStatus(`MLightCAD ${MLIGHTCAD_VERSION} pronto`);

    return {
      version: MLIGHTCAD_VERSION,
      runCommand(command) {
        const text = String(command || '').trim();
        if (!text) return;
        AcApDocManager.instance.sendStringToExecute(`${text}\n`);
      },
      zoomExtents() {
        AcApDocManager.instance.curView.zoomToFitDrawing();
      },
      async openDxfFile(file) {
        if (!file) return false;
        const content = await file.arrayBuffer();
        const success = await AcApDocManager.instance.openDocument(file.name || 'importado.dxf', content, { mode: AcEdOpenMode.Write, progressiveRendering: false, minimumChunkSize: 1000, sysVars: { lwdisplay: false } });
        if (success) AcApDocManager.instance.curView.zoomToFitDrawing();
        return success;
      },
      exportDxfBytes() {
        return dxfOutputBytes(AcApDocManager.instance.curDocument.database);
      },
      downloadDxf(downloadName = fileName) {
        const bytes = dxfOutputBytes(AcApDocManager.instance.curDocument.database);
        const blob = new Blob([bytes], { type: 'application/dxf;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = String(downloadName || 'desenho.dxf').replace(/\.[^.]+$/, '') + '.dxf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      serializeForSave(baseCadData = cadData) {
        const database = AcApDocManager.instance.curDocument.database;
        const bytes = dxfOutputBytes(database);
        const mirror = mirrorDatabase(database);
        const dxfBase64 = encodeBytesToBase64(bytes);
        const stats = { totalEntities: mirror.total, unsupportedMirror: mirror.unsupported };
        return {
          ...baseCadData,
          schemaVersion: Math.max(3, Number(baseCadData.schemaVersion || 0)),
          objects: mirror.objects,
          dimensions: [],
          history: withMlightSnapshot(baseCadData, dxfBase64, stats)
        };
      },
      async createFlange() {
        const outer = asNumber(prompt('Diâmetro externo do flange (mm):', '300'));
        if (!(outer > 0)) return false;
        const bore = Math.max(0, asNumber(prompt('Diâmetro do furo central (mm):', '80')));
        const pcd = Math.max(0, asNumber(prompt('PCD dos furos (mm):', '220')));
        const holeCount = Math.max(0, Math.trunc(asNumber(prompt('Quantidade de furos:', '8'))));
        const holeDiameter = Math.max(0, asNumber(prompt('Diâmetro dos furos (mm):', '18')));
        const center = await acquirePoint('Clique no centro do flange');
        if (!center) return false;
        const model = AcApDocManager.instance.curDocument.database.tables.blockTable.modelSpace;
        appendCircle(model, center, outer / 2);
        if (bore > 0) appendCircle(model, center, bore / 2);
        if (pcd > 0 && holeCount > 0 && holeDiameter > 0) {
          for (let i = 0; i < holeCount; i += 1) {
            const a = (Math.PI * 2 * i) / holeCount;
            appendCircle(model, { x: center.x + Math.cos(a) * pcd / 2, y: center.y + Math.sin(a) * pcd / 2 }, holeDiameter / 2);
          }
        }
        AcApDocManager.instance.curView.zoomToFitDrawing();
        return true;
      },
      async createShaft() {
        const raw = String(prompt('Trechos do eixo no formato comprimento x diâmetro separados por ;', '80x60;120x50;60x40') || '');
        const segments = raw.split(';').map((part) => {
          const [length, diameter] = part.toLowerCase().split('x').map((v) => asNumber(v));
          return { length, diameter };
        }).filter((s) => s.length > 0 && s.diameter > 0);
        if (!segments.length) return false;
        const origin = await acquirePoint('Clique no centro da face inicial do eixo');
        if (!origin) return false;
        const model = AcApDocManager.instance.curDocument.database.tables.blockTable.modelSpace;
        let x = origin.x;
        for (const segment of segments) {
          appendRect(model, x, origin.y - segment.diameter / 2, segment.length, segment.diameter);
          x += segment.length;
        }
        model.appendEntity(new AcDbLine({ x: origin.x, y: origin.y, z: 0 }, { x, y: origin.y, z: 0 }));
        AcApDocManager.instance.curView.zoomToFitDrawing();
        return true;
      }
    };
  } catch (error) {
    try { await AcApDocManager.instance.destroy(); } catch (_cleanupError) {}
    throw error;
  }
}
