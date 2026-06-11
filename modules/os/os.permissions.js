const { normalizeRole } = require('../../config/rbac');

const OS_ACCESS = ['MANUTENCAO', 'MECANICO', 'PRODUCAO', 'ENCARREGADO', 'ENCARREGADO_PRODUCAO', 'DIRECAO'];

// Perfis que podem executar ciclo operacional da OS.
const OS_EXECUTION_ACCESS = [
  ...OS_ACCESS,
  'ENCARREGADO_PRODUCAO',
  'DIRETORIA',
  'RH',
  'ALMOXARIFADO',
  'COMPRAS',
];

// Perfis autorizados a registrar a justificativa operacional sem encerrar a OS.
const OS_ANDAMENTO_ACCESS = [
  'ADMIN',
  'MECANICO',
  'ENCARREGADO',
  'SUPERVISOR_MANUTENCAO',
  'MANUTENCAO_SUPERVISOR',
];

function canRegisterOSAndamento(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  const normalized = normalizeRole(role);
  return OS_ANDAMENTO_ACCESS.map(normalizeRole).includes(normalized);
}

// Perfis com acesso à tela detalhada (inclusive quando já fechada).
const OS_MANUAL_DISPONIBILIDADE_ACCESS = [
  'ADMIN',
  'ENCARREGADO',
  'ENCARREGADO_MANUTENCAO',
  'SUPERVISOR_MANUTENCAO',
  'MANUTENCAO_SUPERVISOR',
];

function canManageOSDisponibilidade(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  const normalized = normalizeRole(role);
  return OS_MANUAL_DISPONIBILIDADE_ACCESS.map(normalizeRole).includes(normalized);
}

const OS_DETALHE_ACCESS = [
  'MANUTENCAO',
  'MECANICO',
  'AUXILIAR',
  'ADMIN',
  'SUPERVISOR_MANUTENCAO',
  'MANUTENCAO_SUPERVISOR',
  'INSPECAO_QUALIDADE',
];

// Perfis com acesso a ações manuais de status na tela detalhada.
// Inspeção e Qualidade consulta detalhes, mas não executa o ciclo da OS.
const OS_STATUS_ACCESS = OS_DETALHE_ACCESS.filter((role) => role !== 'INSPECAO_QUALIDADE');

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

function detailUnauthorizedRedirectPath(userOrRole) {
  return canViewOSDetails(userOrRole) ? null : '/dashboard';
}

module.exports = {
  OS_ACCESS,
  OS_EXECUTION_ACCESS,
  OS_ANDAMENTO_ACCESS,
  OS_MANUAL_DISPONIBILIDADE_ACCESS,
  canRegisterOSAndamento,
  canManageOSDisponibilidade,
  OS_DETALHE_ACCESS,
  OS_STATUS_ACCESS,
  canViewOSDetails,
  postCloseRedirectPath,
  detailUnauthorizedRedirectPath,
};
