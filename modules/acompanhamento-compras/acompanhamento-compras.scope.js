const { normalizeRole } = require('../../config/rbac');
const { SETORES, normalizeSetorCorporativo, setorMatches } = require('../compras/compras-setores');

const ROLE_SETOR = Object.freeze({
  RH: SETORES.ADMINISTRATIVO,
  ENCARREGADO_LOGISTICA: SETORES.LOGISTICA,
  ENCARREGADO_FRIGORIFICO: SETORES.FRIGORIFICO,
  ENCARREGADO_MANUTENCAO: SETORES.RECICLAGEM,
  MANUTENCAO_SUPERVISOR: SETORES.RECICLAGEM,
});

function getAcompanhamentoScope(user = {}) {
  const role = normalizeRole(user.role || user.perfil || '');
  if (role === 'ADMIN') {
    return { role, setor: null, label: 'Todos os setores', isGlobal: true };
  }

  const setor = ROLE_SETOR[role] || null;
  if (!setor) return null;

  return {
    role,
    setor,
    label: setor,
    isGlobal: false,
  };
}

function canViewSetor(user, setorValue) {
  const scope = getAcompanhamentoScope(user);
  if (!scope) return false;
  if (scope.isGlobal) return true;

  const canonical = normalizeSetorCorporativo(setorValue);
  // Compatibilidade com solicitações antigas sem setor: eram do fluxo de Manutenção/Reciclagem.
  if (!canonical) return scope.setor === SETORES.RECICLAGEM;
  return setorMatches(canonical, scope.setor);
}

module.exports = {
  ROLE_SETOR,
  getAcompanhamentoScope,
  canViewSetor,
};
