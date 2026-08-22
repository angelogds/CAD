import {
  AcApDocManager,
  AcApSettingManager,
  AcEdPromptPointOptions,
  AcEdPromptStatus,
  POLARMODE_POLAR_TRACKING,
  togglePolarTracking as togglePolarTrackingSysVar
} from '@mlightcad/cad-simple-viewer';
import {
  AcDbAngleUnits,
  AcDbLinearUnits,
  AcDbOsnapMode,
  AcDbSystemVariables,
  AcDbSysVarManager,
  AcDbUnitsValue,
  acdbHasOsnapMode,
  acdbOsnapModesToMask,
  acdbToggleOsnapMode
} from '@mlightcad/data-model';
import {
  buildAbsolutePointToken,
  buildRelativePolarToken,
  computeMeasurement,
  formatCursorCoordinates
} from './mlightcad-precision.logic.mjs';

export const PRECISION_OSNAP_MODES = Object.freeze([
  { key: 'endpoint', label: 'Extremidade', mode: AcDbOsnapMode.EndPoint },
  { key: 'midpoint', label: 'Ponto médio', mode: AcDbOsnapMode.MidPoint },
  { key: 'center', label: 'Centro', mode: AcDbOsnapMode.Center },
  { key: 'quadrant', label: 'Quadrante', mode: AcDbOsnapMode.Quadrant },
  { key: 'intersection', label: 'Interseção', mode: AcDbOsnapMode.Intersection },
  { key: 'nearest', label: 'Mais próximo', mode: AcDbOsnapMode.Nearest }
]);

const DEFAULT_OSNAP_MASK = acdbOsnapModesToMask(PRECISION_OSNAP_MODES.map((item) => item.mode));
const POLAR_ANGLES = Object.freeze([15, 30, 45, 90]);

function getDatabase() {
  const database = AcApDocManager.instance?.curDocument?.database;
  if (!database) throw new Error('Documento MLightCAD não está disponível.');
  return database;
}

function getView() {
  const view = AcApDocManager.instance?.curView;
  if (!view) throw new Error('Viewport MLightCAD não está disponível.');
  return view;
}

function getEditor() {
  const editor = AcApDocManager.instance?.editor;
  if (!editor) throw new Error('Editor MLightCAD não está disponível.');
  return editor;
}

function getSysVar(name, fallback = 0) {
  try {
    const value = AcDbSysVarManager.instance().getVar(name, getDatabase());
    return value ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function setSysVar(name, value) {
  AcDbSysVarManager.instance().setVar(name, value, getDatabase());
}

function normalizePolarAngle(value) {
  const angle = Number(value);
  if (!Number.isFinite(angle) || angle <= 0 || angle > 180) return 90;
  return angle;
}

function clampPrecision(value, fallback = 3) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(8, n)) : fallback;
}

function isPolarEnabled() {
  return (Number(getSysVar(AcDbSystemVariables.POLARMODE, 0)) & POLARMODE_POLAR_TRACKING) !== 0;
}

function getUnitsState() {
  const db = getDatabase();
  const lengthPrecision = clampPrecision(db.luprec ?? getSysVar(AcDbSystemVariables.LUPREC, 3), 3);
  const anglePrecision = clampPrecision(db.auprec ?? getSysVar(AcDbSystemVariables.AUPREC, 2), 2);
  const insertionUnits = Number(db.insunits ?? getSysVar(AcDbSystemVariables.INSUNITS, AcDbUnitsValue.Millimeters));
  return {
    lengthType: Number(db.lunits ?? getSysVar(AcDbSystemVariables.LUNITS, AcDbLinearUnits.Decimal)),
    lengthPrecision,
    angleType: Number(db.aunits ?? getSysVar(AcDbSystemVariables.AUNITS, AcDbAngleUnits.DecimalDegrees)),
    anglePrecision,
    insertionUnits,
    isMillimeters: insertionUnits === AcDbUnitsValue.Millimeters,
    label: insertionUnits === AcDbUnitsValue.Millimeters ? 'mm' : 'u'
  };
}

async function acquirePoint(message, basePoint = null) {
  const prompt = new AcEdPromptPointOptions(message);
  if (basePoint) {
    prompt.useBasePoint = true;
    prompt.useDashedLine = true;
    prompt.basePoint = basePoint;
  }
  const result = await getEditor().getPoint(prompt);
  return result.status === AcEdPromptStatus.OK ? result.value : null;
}

export function createMlightPrecisionTools({ onChange = () => {} } = {}) {
  const settings = AcApSettingManager.instance;
  let lastOsnapMask = Number(settings.osnapModes || DEFAULT_OSNAP_MASK) || DEFAULT_OSNAP_MASK;
  let disposed = false;
  const cursorSubscriptions = new Set();

  const getState = () => {
    const osnapMask = Number(settings.osnapModes || 0);
    return {
      ortho: Number(getSysVar(AcDbSystemVariables.ORTHOMODE, 0)) !== 0,
      dynamicInput: Number(getSysVar(AcDbSystemVariables.DYNMODE, 0)) !== 0,
      polar: isPolarEnabled(),
      polarAngle: normalizePolarAngle(getSysVar(AcDbSystemVariables.POLARANG, 90)),
      osnap: osnapMask !== 0,
      osnapMask,
      osnapModes: Object.fromEntries(
        PRECISION_OSNAP_MODES.map((item) => [item.key, acdbHasOsnapMode(osnapMask, item.mode)])
      ),
      units: getUnitsState()
    };
  };

  const emit = () => {
    const state = getState();
    onChange(state);
    return state;
  };

  const setOrtho = (enabled) => {
    setSysVar(AcDbSystemVariables.ORTHOMODE, enabled ? 1 : 0);
    return emit();
  };

  const toggleOrtho = () => setOrtho(!getState().ortho);

  const setDynamicInput = (enabled) => {
    setSysVar(AcDbSystemVariables.DYNMODE, enabled ? 3 : 0);
    if (AcDbSystemVariables.DYNPROMPT) {
      setSysVar(AcDbSystemVariables.DYNPROMPT, enabled ? 1 : 0);
    }
    return emit();
  };

  const toggleDynamicInput = () => setDynamicInput(!getState().dynamicInput);

  const setPolar = (enabled) => {
    if (isPolarEnabled() !== Boolean(enabled)) {
      togglePolarTrackingSysVar(getDatabase());
    }
    return emit();
  };

  const togglePolar = () => setPolar(!getState().polar);

  const setPolarAngle = (value) => {
    const angle = normalizePolarAngle(value);
    setSysVar(AcDbSystemVariables.POLARANG, angle);
    return emit();
  };

  const setOsnapEnabled = (enabled) => {
    const current = Number(settings.osnapModes || 0);
    if (enabled) {
      settings.osnapModes = lastOsnapMask || DEFAULT_OSNAP_MASK;
    } else {
      if (current) lastOsnapMask = current;
      settings.osnapModes = 0;
    }
    return emit();
  };

  const toggleOsnap = () => setOsnapEnabled(!getState().osnap);

  const setOsnapMode = (key, enabled) => {
    const item = PRECISION_OSNAP_MODES.find((candidate) => candidate.key === key);
    if (!item) return getState();
    let mask = Number(settings.osnapModes || 0);
    const hasMode = acdbHasOsnapMode(mask, item.mode);
    if (hasMode !== Boolean(enabled)) mask = acdbToggleOsnapMode(mask, item.mode);
    settings.osnapModes = mask;
    if (mask) lastOsnapMask = mask;
    return emit();
  };

  const applyDefaultOsnaps = () => {
    settings.osnapModes = DEFAULT_OSNAP_MASK;
    lastOsnapMask = DEFAULT_OSNAP_MASK;
    return emit();
  };

  const setLengthPrecision = (value) => {
    setSysVar(AcDbSystemVariables.LUPREC, clampPrecision(value, 3));
    return emit();
  };

  const setAnglePrecision = (value) => {
    setSysVar(AcDbSystemVariables.AUPREC, clampPrecision(value, 2));
    return emit();
  };

  const applyManufacturingUnits = ({ lengthPrecision = 3, anglePrecision = 2 } = {}) => {
    setSysVar(AcDbSystemVariables.LUNITS, AcDbLinearUnits.Decimal);
    setSysVar(AcDbSystemVariables.LUPREC, clampPrecision(lengthPrecision, 3));
    setSysVar(AcDbSystemVariables.AUNITS, AcDbAngleUnits.DecimalDegrees);
    setSysVar(AcDbSystemVariables.AUPREC, clampPrecision(anglePrecision, 2));
    setSysVar(AcDbSystemVariables.ANGDIR, 0);
    setSysVar(AcDbSystemVariables.INSUNITS, AcDbUnitsValue.Millimeters);
    return emit();
  };

  const subscribeCursor = (listener) => {
    if (typeof listener !== 'function') return () => {};
    const view = getView();
    const handler = (point) => {
      const value = {
        x: Number(point?.x || 0),
        y: Number(point?.y || 0)
      };
      const decimals = getUnitsState().lengthPrecision;
      listener({ ...value, text: formatCursorCoordinates(value, decimals) });
    };
    view.events.mouseMove.addEventListener(handler);
    const unsubscribe = () => {
      try { view.events.mouseMove.removeEventListener(handler); } catch (_error) {}
      cursorSubscriptions.delete(unsubscribe);
    };
    cursorSubscriptions.add(unsubscribe);
    return unsubscribe;
  };

  const measureDistance = async () => {
    const editor = getEditor();
    if (editor.isActive) throw new Error('Finalize o comando atual antes de medir.');
    const first = await acquirePoint('MEDIR: informe o primeiro ponto');
    if (!first) return null;
    const second = await acquirePoint('MEDIR: informe o segundo ponto', first);
    if (!second) return null;
    return computeMeasurement(first, second);
  };

  const createPolarLine = async ({ distance, angleDeg } = {}) => {
    const editor = getEditor();
    if (editor.isActive) throw new Error('Finalize o comando atual antes de criar a linha.');
    const polarToken = buildRelativePolarToken(distance, angleDeg);
    const start = await acquirePoint('LINHA D×Â: informe o ponto inicial');
    if (!start) return null;
    const startToken = buildAbsolutePointToken(start);
    editor.enqueueScriptInputs([startToken, polarToken, '']);
    AcApDocManager.instance.sendStringToExecute('line\n');
    return { start, startToken, polarToken, distance: Number(distance), angleDeg: Number(angleDeg) };
  };

  const runNativeMeasurement = (kind) => {
    const command = ({ area: 'measurearea', angle: 'measureangle', distance: 'measuredistance' })[String(kind || '').toLowerCase()];
    if (!command) return false;
    AcApDocManager.instance.sendStringToExecute(`${command}\n`);
    return true;
  };

  const sysVarHandler = () => {
    if (!disposed) emit();
  };
  const settingHandler = (args) => {
    if (!disposed && args?.key === 'osnapModes') emit();
  };

  AcDbSysVarManager.instance().events.sysVarChanged.addEventListener(sysVarHandler);
  settings.events.modified.addEventListener(settingHandler);

  const dispose = () => {
    disposed = true;
    for (const unsubscribe of [...cursorSubscriptions]) unsubscribe();
    try { AcDbSysVarManager.instance().events.sysVarChanged.removeEventListener(sysVarHandler); } catch (_error) {}
    try { settings.events.modified.removeEventListener(settingHandler); } catch (_error) {}
  };

  emit();

  return {
    getState,
    getUnitsState,
    setOrtho,
    toggleOrtho,
    setDynamicInput,
    toggleDynamicInput,
    setPolar,
    togglePolar,
    setPolarAngle,
    setOsnapEnabled,
    toggleOsnap,
    setOsnapMode,
    applyDefaultOsnaps,
    setLengthPrecision,
    setAnglePrecision,
    applyManufacturingUnits,
    subscribeCursor,
    measureDistance,
    createPolarLine,
    runNativeMeasurement,
    dispose,
    polarAngles: [...POLAR_ANGLES],
    osnapModes: PRECISION_OSNAP_MODES.map(({ key, label }) => ({ key, label }))
  };
}
