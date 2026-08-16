function header(req, name) {
  const key = String(name || '').toLowerCase();
  const viaGet = typeof req?.get === 'function' ? req.get(name) : null;
  const value = viaGet ?? req?.headers?.[key] ?? '';
  return String(value || '').split(',')[0].trim();
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === 'null') return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.origin.toLowerCase();
  } catch (_e) {
    return null;
  }
}

function requestOrigin(req) {
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  if (!host) return null;
  const proto = (header(req, 'x-forwarded-proto') || req?.protocol || 'https').toLowerCase();
  if (!['http', 'https'].includes(proto)) return null;
  return normalizeOrigin(`${proto}://${host}`);
}

function configuredOrigins() {
  const values = [process.env.AI_ALLOWED_ORIGINS, process.env.CAPACITOR_SERVER_URL]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','));
  return values.map(normalizeOrigin).filter(Boolean);
}

function allowedOrigins(req) {
  return new Set([requestOrigin(req), ...configuredOrigins()].filter(Boolean));
}

function forbidden(res) {
  return res.status(403).json({ ok: false, error: 'Origem da requisição não autorizada.', code: 'AI_ORIGIN_DENIED' });
}

function requireTrustedAIWrite(req, res, next) {
  const fetchSite = header(req, 'sec-fetch-site').toLowerCase();
  if (fetchSite === 'cross-site') return forbidden(res);

  const allowed = allowedOrigins(req);
  const originHeader = header(req, 'origin');
  if (originHeader) {
    const origin = normalizeOrigin(originHeader);
    if (!origin || !allowed.has(origin)) return forbidden(res);
    return next();
  }

  const refererHeader = header(req, 'referer');
  if (refererHeader) {
    const refererOrigin = normalizeOrigin(refererHeader);
    if (!refererOrigin || !allowed.has(refererOrigin)) return forbidden(res);
  }

  // Clientes nativos/legados podem não enviar Origin/Referer/Sec-Fetch-Site.
  // Nesses casos a sessão + RBAC continuam obrigatórios nas rotas seguintes.
  return next();
}

module.exports = {
  requireTrustedAIWrite,
  normalizeOrigin,
  requestOrigin,
  allowedOrigins,
};
