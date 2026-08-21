'use strict';

const BASE_URL = String(process.env.CAD_PYTHON_URL || '').trim().replace(/\/$/, '');
const INTERNAL_TOKEN = String(process.env.CAD_PYTHON_TOKEN || '').trim();
const DEFAULT_TIMEOUT_MS = Number(process.env.CAD_PYTHON_TIMEOUT_MS || 12000);

function isConfigured() {
  return Boolean(BASE_URL);
}

async function request(path, { method = 'GET', body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!isConfigured()) {
    return { ok: false, available: false, status: 503, error: 'CAD Python Engine não configurado.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const headers = { Accept: 'application/json' };
    if (body != null) headers['Content-Type'] = 'application/json';
    if (INTERNAL_TOKEN) headers['X-CAD-Engine-Token'] = INTERNAL_TOKEN;

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : {}; } catch (_e) { data = { raw }; }
    if (!response.ok) {
      return {
        ok: false,
        available: true,
        status: response.status,
        error: data?.detail || data?.error || `CAD Python Engine retornou HTTP ${response.status}.`,
        data,
      };
    }
    return { ok: true, available: true, status: response.status, data };
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return {
      ok: false,
      available: false,
      status: 503,
      error: timedOut ? 'CAD Python Engine excedeu o tempo limite.' : `CAD Python Engine indisponível: ${error?.message || error}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function health() {
  return request('/health', { timeoutMs: 3500 });
}

async function analyze(cad, options = {}) {
  return request('/v1/analyze', {
    method: 'POST',
    body: {
      cad: cad || {},
      thickness_mm: options.thickness_mm ?? null,
      density_kg_m3: options.density_kg_m3 ?? null,
    },
  });
}

async function nesting(payload = {}) {
  return request('/v1/nesting', {
    method: 'POST',
    body: payload || {},
    timeoutMs: 25000,
  });
}

async function exportDxf(cad, filename) {
  return request('/v1/dxf/export', {
    method: 'POST',
    body: { cad: cad || {}, filename: filename || 'desenho-tecnico.dxf' },
    timeoutMs: 20000,
  });
}

async function importDxf(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { ok: false, available: true, status: 400, error: 'Arquivo DXF vazio.' };
  }
  return request('/v1/dxf/import', {
    method: 'POST',
    body: { content_base64: buffer.toString('base64') },
    timeoutMs: 20000,
  });
}

module.exports = {
  isConfigured,
  health,
  analyze,
  nesting,
  exportDxf,
  importDxf,
};
