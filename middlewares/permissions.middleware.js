const { normalizeRole } = require('../config/rbac');

const AUTHORIZED_NOTIFICATION_ROLES = ['ADMIN', 'ENCARREGADO_MANUTENCAO'];
const RESTRICTED_NOTIFICATION_MESSAGE = 'Acesso restrito. Apenas Admin e Encarregado de Manutenção podem enviar notificações via WhatsApp ou visualizar dados de contato dos colaboradores.';

function canSendWhatsappNotificationRole(role) {
  return AUTHORIZED_NOTIFICATION_ROLES.includes(normalizeRole(role));
}

function canSendWhatsappNotification(req, res, next) {
  const user = req.session?.user;

  if (!user) {
    if (typeof req.flash === 'function') req.flash('error', 'Faça login para continuar.');
    return res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl || '/dashboard')}`);
  }

  if (!canSendWhatsappNotificationRole(user.role)) {
    if (req.accepts('html')) {
      return res.status(403).render('errors/403', {
        layout: 'layout',
        title: 'Acesso negado',
        message: RESTRICTED_NOTIFICATION_MESSAGE,
      });
    }

    return res.status(403).json({
      ok: false,
      error: RESTRICTED_NOTIFICATION_MESSAGE,
    });
  }

  return next();
}

function exposeNotificationPermissions(req, res, next) {
  res.locals.canSendWhatsappNotification = canSendWhatsappNotificationRole(req.session?.user?.role || '');
  res.locals.AUTHORIZED_NOTIFICATION_ROLES = AUTHORIZED_NOTIFICATION_ROLES;
  return next();
}

module.exports = {
  AUTHORIZED_NOTIFICATION_ROLES,
  RESTRICTED_NOTIFICATION_MESSAGE,
  canSendWhatsappNotificationRole,
  canSendWhatsappNotification,
  exposeNotificationPermissions,
};
