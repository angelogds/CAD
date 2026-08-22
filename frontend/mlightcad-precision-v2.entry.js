import {
  AcApDocManager,
  AcEdPromptDoubleOptions,
  AcEdPromptPointOptions,
  AcEdPromptStatus
} from '@mlightcad/cad-simple-viewer';
import { AcDbLine } from '@mlightcad/data-model';

export const PRECISION_V2_VERSION = '2.0.0';

function currentEditor() {
  const editor = AcApDocManager.instance?.editor;
  if (!editor) throw new Error('Editor MLightCAD não está disponível.');
  return editor;
}

function currentView() {
  const view = AcApDocManager.instance?.curView;
  if (!view) throw new Error('Viewport MLightCAD não está disponível.');
  return view;
}

function currentModelSpace() {
  const model = AcApDocManager.instance?.curDocument?.database?.tables?.blockTable?.modelSpace;
  if (!model) throw new Error('Model Space MLightCAD não está disponível.');
  return model;
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeAngleDegrees(value) {
  const raw = finite(value, 0);
  return ((raw % 360) + 360) % 360;
}

export function endpointFromDistanceAngle(start, distance, angleDegrees) {
  const dist = Math.abs(finite(distance, 0));
  const angle = normalizeAngleDegrees(angleDegrees) * Math.PI / 180;
  return {
    x: finite(start?.x) + Math.cos(angle) * dist,
    y: finite(start?.y) + Math.sin(angle) * dist,
    z: 0
  };
}

export function measureBetweenPoints(first, second) {
  const dx = finite(second?.x) - finite(first?.x);
  const dy = finite(second?.y) - finite(first?.y);
  const distance = Math.hypot(dx, dy);
  const angleDegrees = normalizeAngleDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
  return { dx, dy, distance, angleDegrees };
}

export function formatCoordinate(value, precision = 3) {
  const n = finite(value, 0);
  return n.toFixed(Math.max(0, Math.min(6, Math.trunc(precision))));
}

async function acquirePoint(message) {
  const options = new AcEdPromptPointOptions(message);
  const result = await currentEditor().getPoint(options);
  return result.status === AcEdPromptStatus.OK ? result.value : null;
}

async function acquirePositiveDouble(message) {
  const options = new AcEdPromptDoubleOptions(message);
  const result = await currentEditor().getDouble(options);
  if (result.status !== AcEdPromptStatus.OK) return null;
  const value = Number(result.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function acquireDouble(message) {
  const options = new AcEdPromptDoubleOptions(message);
  const result = await currentEditor().getDouble(options);
  if (result.status !== AcEdPromptStatus.OK) return null;
  const value = Number(result.value);
  return Number.isFinite(value) ? value : null;
}

export function createMlightPrecisionV2Tools({
  onCursor = () => {},
  onMeasurement = () => {},
  onLineCreated = () => {}
} = {}) {
  const view = currentView();
  let disposed = false;
  let lastCursor = { x: 0, y: 0 };

  const cursorHandler = (args) => {
    if (disposed) return;
    lastCursor = { x: finite(args?.x), y: finite(args?.y) };
    onCursor({ ...lastCursor });
  };
  view.events.mouseMove.addEventListener(cursorHandler);

  const measureTwoPoints = async () => {
    const first = await acquirePoint('MEDIR 2P — informe o primeiro ponto');
    if (!first) return null;
    const second = await acquirePoint('MEDIR 2P — informe o segundo ponto');
    if (!second) return null;
    const result = {
      first: { x: first.x, y: first.y },
      second: { x: second.x, y: second.y },
      ...measureBetweenPoints(first, second)
    };
    currentEditor().showMessage(
      `MEDIR 2P: distância ${formatCoordinate(result.distance)} mm | ΔX ${formatCoordinate(result.dx)} | ΔY ${formatCoordinate(result.dy)} | ângulo ${formatCoordinate(result.angleDegrees, 2)}°`
    );
    onMeasurement(result);
    return result;
  };

  const createLineDistanceAngle = async () => {
    const start = await acquirePoint('LINHA D/A — informe o ponto inicial');
    if (!start) return null;
    const distance = await acquirePositiveDouble('LINHA D/A — distância (mm)');
    if (!(distance > 0)) return null;
    const angleDegrees = await acquireDouble('LINHA D/A — ângulo em graus');
    if (angleDegrees == null) return null;

    const end = endpointFromDistanceAngle(start, distance, angleDegrees);
    const entity = new AcDbLine(
      { x: start.x, y: start.y, z: 0 },
      { x: end.x, y: end.y, z: 0 }
    );
    currentModelSpace().appendEntity(entity);
    const result = {
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      distance,
      angleDegrees: normalizeAngleDegrees(angleDegrees),
      entity
    };
    currentEditor().showMessage(
      `LINHA D/A criada: ${formatCoordinate(distance)} mm @ ${formatCoordinate(result.angleDegrees, 2)}°`
    );
    onLineCreated(result);
    return result;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try { view.events.mouseMove.removeEventListener(cursorHandler); } catch (_error) {}
  };

  return {
    version: PRECISION_V2_VERSION,
    getCursor: () => ({ ...lastCursor }),
    measureTwoPoints,
    createLineDistanceAngle,
    dispose
  };
}
