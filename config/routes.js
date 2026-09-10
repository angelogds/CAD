const OFFICIAL_ROUTES = Object.freeze({
  dashboard: '/dashboard',
  tv: '/tv',
  os: '/os',
  ia: '/ai',
  inspecao: '/inspecao',
  compras: '/compras',
  almoxarifado: '/almoxarifado',
  estoque: '/estoque',
  pcm: '/pcm',
});

const COMPATIBILITY_ALIASES = Object.freeze([
  { from: '/ordens-servico', to: OFFICIAL_ROUTES.os },
  // Fase 3: entrada curta do módulo RH preservando a rota histórica da Escala.
  { from: '/rh', to: '/escala/rh' },
]);

function buildRedirectTarget(req, aliasFrom, aliasTo) {
  const suffix = req.originalUrl.startsWith(aliasFrom)
    ? req.originalUrl.slice(aliasFrom.length)
    : req.originalUrl;

  return `${aliasTo}${suffix || ''}`;
}

function registerCompatibilityAlias(app, aliasFrom, aliasTo) {
  app.use(aliasFrom, (req, res) => {
    const redirectStatus = ['GET', 'HEAD'].includes(req.method) ? 301 : 307;
    return res.redirect(redirectStatus, buildRedirectTarget(req, aliasFrom, aliasTo));
  });
}

module.exports = {
  OFFICIAL_ROUTES,
  COMPATIBILITY_ALIASES,
  registerCompatibilityAlias,
};
