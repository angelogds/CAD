const { normalizeRole } = require('../../config/rbac');

function roleOf(req) {
  return normalizeRole(req.session?.user?.role || '');
}

function isColaboradorOnly(req) {
  return roleOf(req) === 'COLABORADOR';
}

function canManageProfiles(req) {
  return ['ADMIN', 'RH'].includes(roleOf(req));
}

function canManageFerramental(req) {
  return ['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR'].includes(roleOf(req));
}

function canManageEPIAndMateriais(req) {
  return ['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR'].includes(roleOf(req));
}

function canValidateCertificados(req) {
  return ['ADMIN', 'RH'].includes(roleOf(req));
}

function canGenerateReports(req) {
  return ['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR'].includes(roleOf(req));
}

function canAccessColaborador(req, colaborador) {
  const role = roleOf(req);
  if (['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR'].includes(role)) return true;
  if (role === 'COLABORADOR') {
    const userId = Number(req.session?.user?.id || 0);
    return Number(colaborador?.user_id || 0) === userId;
  }
  return false;
}

module.exports = {
  roleOf,
  isColaboradorOnly,
  canManageProfiles,
  canManageFerramental,
  canManageEPIAndMateriais,
  canValidateCertificados,
  canGenerateReports,
  canAccessColaborador,
};
