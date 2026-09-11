(function dimensionPersistenceRuntime(globalScope) {
  'use strict';

  const DIMENSION_TYPE = Object.freeze({
    ROTATED: 0,
    ALIGNED: 1,
    ANGULAR: 2,
    DIAMETER: 3,
    RADIUS: 4,
    ANGULAR_3_POINT: 5,
    ORDINATE: 6,
  });

  const ACI_COLORS = Object.freeze({
    1: '#ff0000',
    2: '#ffff00',
    3: '#00ff00',
    4: '#00ffff',
    5: '#0000ff',
    6: '#ff00ff',
    7: '#ffffff',
  });

  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function decodeBase64(base64) {
    const source = String(base64 || '');
    if (!source) return '';
    if (typeof globalScope.atob === 'function') return globalScope.atob(source);
    if (typeof Buffer !== 'undefined') return Buffer.from(source, 'base64').toString('utf8');
    throw new Error('Decodificador Base64 indisponível.');
  }

  function encodeBase64(text) {
    const source = String(text || '');
    if (typeof globalScope.btoa === 'function') return globalScope.btoa(source);
    if (typeof Buffer !== 'undefined') return Buffer.from(source, 'utf8').toString('base64');
    throw new Error('Codificador Base64 indisponível.');
  }

  function parsePairs(dxfText) {
    const lines = String(dxfText || '').replace(/\r/g, '').split('\n');
    const pairs = [];
    for (let index = 0; index + 1 < lines.length; index += 2) {
      const code = Number.parseInt(String(lines[index] || '').trim(), 10);
      if (!Number.isInteger(code)) continue;
      pairs.push({ code, value: String(lines[index + 1] ?? '').trim() });
    }
    return pairs;
  }

  function readEntityRecords(dxfText) {
    const records = [];
    let section = '';
    let enteringSection = false;
    let current = null;
    let sawEntities = false;

    const flush = () => {
      if (current) records.push(current);
      current = null;
    };

    for (const pair of parsePairs(dxfText)) {
      const token = pair.value.toUpperCase();
      if (pair.code === 0 && token === 'SECTION') {
        flush();
        enteringSection = true;
        section = '';
        continue;
      }
      if (enteringSection && pair.code === 2) {
        section = token;
        enteringSection = false;
        if (section === 'ENTITIES') sawEntities = true;
        continue;
      }
      if (pair.code === 0 && token === 'ENDSEC') {
        flush();
        section = '';
        enteringSection = false;
        continue;
      }
      if (section !== 'ENTITIES') continue;
      if (pair.code === 0) {
        flush();
        current = { type: token, pairs: [] };
        continue;
      }
      if (current) current.pairs.push(pair);
    }
    flush();
    return { records, sawEntities };
  }

  function first(record, code) {
    return record?.pairs?.find((pair) => pair.code === code)?.value ?? null;
  }

  function point(record, xCode) {
    const x = numberOrNull(first(record, xCode));
    const y = numberOrNull(first(record, xCode + 10));
    return x == null || y == null ? null : { x, y };
  }

  function distance(a, b) {
    if (!a || !b) return null;
    return Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y));
  }

  function midpoint(a, b) {
    if (!a || !b) return null;
    return { x: (Number(a.x) + Number(b.x)) / 2, y: (Number(a.y) + Number(b.y)) / 2 };
  }

  function formatted(value, decimals = 3) {
    const number = numberOrNull(value);
    return number == null ? '' : number.toFixed(decimals);
  }

  function explicitLabel(record) {
    const text = String(first(record, 1) || '').trim();
    if (!text || text === '<>') return '';
    return text.replace(/%%[cC]/g, 'Ø');
  }

  function rgbIntToHex(value) {
    const number = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(number) || number < 0) return null;
    return `#${(number & 0xffffff).toString(16).padStart(6, '0')}`;
  }

  function colorFromRecord(record) {
    const trueColor = rgbIntToHex(first(record, 420));
    if (trueColor) return trueColor;
    const aci = Number.parseInt(first(record, 62), 10);
    return ACI_COLORS[Math.abs(aci)] || null;
  }

  function normalizeFallbackStyle(style = {}) {
    const source = style && typeof style === 'object' ? style : {};
    const color = /^#[0-9a-f]{6}$/i.test(String(source.color || '')) ? String(source.color).toLowerCase() : null;
    const lineType = String(source.lineType || '').trim() || null;
    const lineWeight = numberOrNull(source.lineWeight);
    const lineTypeScale = numberOrNull(source.lineTypeScale);
    return {
      ...(color ? { color } : {}),
      ...(lineType ? { lineType } : {}),
      ...(lineWeight != null ? { lineWeight } : {}),
      ...(lineTypeScale != null && lineTypeScale > 0 ? { lineTypeScale } : {}),
    };
  }

  function readLayerStyles(dxfText) {
    const styles = {};
    let section = '';
    let enteringSection = false;
    let table = '';
    let enteringTable = false;
    let current = null;

    const flush = () => {
      if (!current) return;
      const name = String(first(current, 2) || '').trim();
      if (name) {
        const color = colorFromRecord(current);
        const lineType = String(first(current, 6) || '').trim();
        const lineWeight = numberOrNull(first(current, 370));
        styles[name] = {
          ...(color ? { color } : {}),
          ...(lineType ? { lineType } : {}),
          ...(lineWeight != null && lineWeight >= 0 ? { lineWeight } : {}),
        };
      }
      current = null;
    };

    for (const pair of parsePairs(dxfText)) {
      const token = pair.value.toUpperCase();
      if (pair.code === 0 && token === 'SECTION') {
        flush();
        enteringSection = true;
        section = '';
        table = '';
        continue;
      }
      if (enteringSection && pair.code === 2) {
        section = token;
        enteringSection = false;
        continue;
      }
      if (pair.code === 0 && token === 'ENDSEC') {
        flush();
        section = '';
        table = '';
        enteringTable = false;
        continue;
      }
      if (section !== 'TABLES') continue;
      if (pair.code === 0 && token === 'TABLE') {
        flush();
        enteringTable = true;
        table = '';
        continue;
      }
      if (enteringTable && pair.code === 2) {
        table = token;
        enteringTable = false;
        continue;
      }
      if (pair.code === 0 && token === 'ENDTAB') {
        flush();
        table = '';
        continue;
      }
      if (table !== 'LAYER') continue;
      if (pair.code === 0 && token === 'LAYER') {
        flush();
        current = { type: 'LAYER', pairs: [] };
        continue;
      }
      if (pair.code === 0) {
        flush();
        continue;
      }
      if (current) current.pairs.push(pair);
    }
    flush();
    return styles;
  }

  function resolveDimensionStyle(record, layer, layerStyles = {}, fallbackStyle = {}) {
    const fallback = normalizeFallbackStyle(fallbackStyle);
    const inherited = layerStyles[layer] || {};
    const explicitColor = colorFromRecord(record);
    const rawLineType = String(first(record, 6) || '').trim();
    const explicitLineType = rawLineType && !/^BY(LAYER|BLOCK)$/i.test(rawLineType) ? rawLineType : null;
    const rawWeight = numberOrNull(first(record, 370));
    const explicitWeight = rawWeight != null && rawWeight >= 0 ? rawWeight : null;
    const rawScale = numberOrNull(first(record, 48));

    const color = explicitColor || inherited.color || fallback.color || null;
    const lineType = explicitLineType || inherited.lineType || fallback.lineType || null;
    const lineWeight = explicitWeight ?? inherited.lineWeight ?? fallback.lineWeight ?? null;
    const lineTypeScale = rawScale && rawScale > 0 ? rawScale : (fallback.lineTypeScale || 1);

    return {
      ...(color ? { color } : {}),
      ...(lineType ? { lineType } : {}),
      ...(lineWeight != null ? { lineWeight } : {}),
      lineTypeScale,
    };
  }

  function baseDimension(record, id, layer, kind, geometry, style) {
    return {
      id,
      type: 'dimension',
      layer,
      visible: true,
      geometry,
      ...(style && Object.keys(style).length ? { style } : {}),
      metadata: { source: 'mlightcad-dxf', dxfDimensionType: kind },
    };
  }

  function linearDimension(record, id, layer, kind, style) {
    const p1 = point(record, 13);
    const p2 = point(record, 14);
    if (!p1 || !p2) return null;
    const measured = numberOrNull(first(record, 42));
    const rotationDegrees = numberOrNull(first(record, 50));
    const textRotationDegrees = numberOrNull(first(record, 53));
    return baseDimension(record, id, layer, kind, {
      mode: kind === DIMENSION_TYPE.ALIGNED ? 'aligned' : 'linear',
      p1,
      p2,
      dimensionLinePoint: point(record, 10),
      textPoint: point(record, 11) || point(record, 10) || midpoint(p1, p2),
      ...(rotationDegrees != null ? { rotation: rotationDegrees * Math.PI / 180 } : {}),
      ...(textRotationDegrees != null ? { textRotation: textRotationDegrees * Math.PI / 180 } : {}),
      label: explicitLabel(record) || formatted(measured ?? distance(p1, p2)),
    }, style);
  }

  function radialDimension(record, id, layer, kind, style) {
    const p1 = point(record, 10);
    const p2 = point(record, 15);
    if (!p1 || !p2) return null;
    const prefix = kind === DIMENSION_TYPE.DIAMETER ? 'Ø' : 'R';
    const measured = numberOrNull(first(record, 42));
    return baseDimension(record, id, layer, kind, {
      mode: kind === DIMENSION_TYPE.DIAMETER ? 'diameter' : 'radial',
      p1,
      p2,
      dimensionLinePoint: point(record, 10),
      textPoint: point(record, 11) || midpoint(p1, p2),
      label: explicitLabel(record) || `${prefix}${formatted(measured ?? distance(p1, p2))}`,
    }, style);
  }

  function angularDimension(record, id, layer, kind, style) {
    const vertex = point(record, 15);
    const p1 = point(record, 13);
    const p2 = point(record, 14);
    if (!vertex || !p1 || !p2) return null;

    const startAngle = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
    let endAngle = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
    while (endAngle < startAngle) endAngle += Math.PI * 2;
    const definitionPoint = point(record, 10);
    const radius = distance(vertex, definitionPoint)
      || Math.max(distance(vertex, p1) || 0, distance(vertex, p2) || 0, 1);
    const angleDegrees = (endAngle - startAngle) * 180 / Math.PI;

    return baseDimension(record, id, layer, kind, {
      mode: 'angular',
      vertex,
      p1,
      p2,
      radius,
      dimensionLinePoint: definitionPoint,
      startAngle,
      endAngle,
      textPoint: point(record, 11),
      label: explicitLabel(record) || `${formatted(angleDegrees, 2)}°`,
    }, style);
  }

  function dimensionFromRecord(record, index, layerStyles = {}, fallbackStyle = {}) {
    if (record.type !== 'DIMENSION') return null;
    const rawKind = Number.parseInt(first(record, 70) || '0', 10);
    const kind = rawKind & 7;
    const handle = String(first(record, 5) || first(record, 2) || index + 1)
      .replace(/[^a-zA-Z0-9_.-]/g, '-');
    const id = `mlight-dim-${handle}`;
    const layer = String(first(record, 8) || 'cotas').trim() || 'cotas';
    const style = resolveDimensionStyle(record, layer, layerStyles, fallbackStyle);

    if (kind === DIMENSION_TYPE.ROTATED || kind === DIMENSION_TYPE.ALIGNED) {
      return linearDimension(record, id, layer, kind, style);
    }
    if (kind === DIMENSION_TYPE.DIAMETER || kind === DIMENSION_TYPE.RADIUS) {
      return radialDimension(record, id, layer, kind, style);
    }
    if (kind === DIMENSION_TYPE.ANGULAR || kind === DIMENSION_TYPE.ANGULAR_3_POINT) {
      return angularDimension(record, id, layer, kind, style);
    }
    return null;
  }

  function parseDxfDimensions(dxfText, options = {}) {
    const { records, sawEntities } = readEntityRecords(dxfText);
    const layerStyles = readLayerStyles(dxfText);
    const fallbackStyle = options.dimensionStyle || {};
    return {
      ok: sawEntities,
      dimensions: records.map((record, index) => dimensionFromRecord(record, index, layerStyles, fallbackStyle)).filter(Boolean),
    };
  }

  function latestMlightSnapshot(payload = {}) {
    const history = Array.isArray(payload.history) ? payload.history : [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const item = history[index];
      if (item && typeof item === 'object' && item.kind === 'mlightcad-document' && item.dxfBase64) {
        return item;
      }
    }
    return null;
  }

  function dimensionStyleFromCadData(payload = {}, previous = {}) {
    return payload?.manufacturing?.styleSettings?.dimension
      || previous?.manufacturing?.styleSettings?.dimension
      || {};
  }

  function recoverDimensions(payload = {}, previous = {}) {
    const fallback = Array.isArray(previous.dimensions) ? previous.dimensions : [];
    const snapshot = latestMlightSnapshot(payload);
    if (!snapshot?.dxfBase64) {
      return { dimensions: fallback, recovered: false, reason: 'snapshot-missing' };
    }
    try {
      const parsed = parseDxfDimensions(decodeBase64(snapshot.dxfBase64), {
        dimensionStyle: dimensionStyleFromCadData(payload, previous),
      });
      if (!parsed.ok) {
        return { dimensions: fallback, recovered: false, reason: 'entities-section-missing' };
      }
      return { dimensions: parsed.dimensions, recovered: true, reason: null };
    } catch (error) {
      return { dimensions: fallback, recovered: false, reason: error?.message || String(error) };
    }
  }

  function patchSerializer(app) {
    if (!app || typeof app.serializeForSave !== 'function') return false;
    if (app.__dimensionPersistencePatched) return true;

    const original = app.serializeForSave.bind(app);
    app.serializeForSave = function serializeWithNativeDimensions(baseCadData = {}) {
      const payload = original(baseCadData);
      const recovery = recoverDimensions(payload, baseCadData);
      payload.dimensions = recovery.dimensions;
      const snapshot = latestMlightSnapshot(payload);
      if (snapshot?.stats && typeof snapshot.stats === 'object') {
        snapshot.stats.nativeDimensions = payload.dimensions.length;
        snapshot.stats.dimensionRecovery = recovery.recovered ? 'ok' : recovery.reason;
      }
      return payload;
    };
    app.__dimensionPersistencePatched = true;
    return true;
  }

  function waitForSaveState(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        const state = globalScope.document?.getElementById('mlightSaveState');
        const value = state?.dataset?.state || '';
        if (value === 'saved') return resolve(true);
        if (value === 'error') return reject(new Error(state?.textContent || 'Falha ao salvar antes do PDF.'));
        if (Date.now() - startedAt >= timeoutMs) {
          return reject(new Error('Tempo esgotado ao salvar o desenho antes do PDF.'));
        }
        globalScope.setTimeout(check, 75);
      };
      globalScope.setTimeout(check, 25);
    });
  }

  function installPdfSaveGuard() {
    const document = globalScope.document;
    if (!document || document.documentElement.dataset.cadPdfSaveGuard === '1') return false;
    document.documentElement.dataset.cadPdfSaveGuard = '1';

    document.addEventListener('click', async (event) => {
      const link = event.target?.closest?.('a[href*="/desenho-tecnico/cad/"][href*="/pdf"]');
      if (!link || link.dataset.cadPdfBypass === '1') return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const href = link.href;
      const saveButton = document.getElementById('mlightSaveBtn');
      const status = document.getElementById('mlightCadStatus');

      try {
        if (!patchSerializer(globalScope.CAD_MLIGHT_APP)) {
          throw new Error('Motor CAD ainda não está pronto para salvar as cotas.');
        }
        if (!saveButton) throw new Error('Botão de salvamento do CAD não encontrado.');

        if (status) {
          status.textContent = 'Salvando desenho e cotas antes de gerar PDF…';
          status.dataset.state = 'loading';
        }
        saveButton.click();
        await waitForSaveState();

        if (status) {
          status.textContent = 'Cotas salvas. Gerando PDF…';
          status.dataset.state = 'ok';
        }
        link.dataset.cadPdfBypass = '1';
        globalScope.location.assign(href);
      } catch (error) {
        console.error('[CAD][COTAS][PDF]', error);
        if (status) {
          status.textContent = `PDF não gerado: ${error.message || error}`;
          status.dataset.state = 'error';
        }
      }
    }, true);
    return true;
  }

  function installWhenReady() {
    patchSerializer(globalScope.CAD_MLIGHT_APP);
    installPdfSaveGuard();
  }

  const api = {
    DIMENSION_TYPE,
    decodeBase64,
    encodeBase64,
    parseDxfDimensions,
    latestMlightSnapshot,
    recoverDimensions,
    patchSerializer,
    installPdfSaveGuard,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope && globalScope.document) {
    globalScope.CAD_DIMENSION_PERSISTENCE = api;
    globalScope.addEventListener?.('cad:mlight-ready', installWhenReady);
    installWhenReady();
    globalScope.setTimeout(installWhenReady, 250);
    globalScope.setTimeout(installWhenReady, 1000);
  }
})(typeof window !== 'undefined' ? window : globalThis);