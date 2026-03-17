const { normalizeRole } = require('../../config/rbac');

const OS_ACCESS = ['MANUTENCAO', 'MECANICO', 'PRODUCAO', 'ENCARREGADO', 'DIRECAO'];

// Perfis que podem executar ciclo operacional da OS.
const OS_EXECUTION_ACCESS = [
  ...OS_ACCESS,
  'ENCARREGADO_PRODUCAO',
  'DIRETORIA',
  'RH',
  'ALMOXARIFADO',
  'COMPRAS',
];

// Perfis com acesso à tela detalhada (inclusive quando já fechada).
const OS_DETALHE_ACCESS = [
  'MANUTENCAO',
  'MECANICO',
  'AUXILIAR',
  'ADMIN',
  'SUPERVISOR_MANUTENCAO',
  'MANUTENCAO_SUPERVISOR',
];

function canViewOSDetails(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  if (normalized === 'ADMIN') return true;
  return OS_DETALHE_ACCESS.map(normalizeRole).includes(normalized);
}

function postCloseRedirectPath(userOrRole) {
  return canViewOSDetails(userOrRole) ? null : '/painel-operacional';
}

module.exports = {
  OS_ACCESS,
  OS_EXECUTION_ACCESS,
  OS_DETALHE_ACCESS,
  canViewOSDetails,
  postCloseRedirectPath,
};
