function normalizeRole(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

const ROLE_PROFILE = Object.freeze({
  ENCARREGADO_MANUTENCAO: { funcao: 'Encarregado de Manutenção', setor: 'RECICLAGEM', directUserIdentity: true },
  MANUTENCAO_SUPERVISOR: { funcao: 'Supervisor de Manutenção', setor: 'RECICLAGEM', directUserIdentity: true },
  ENCARREGADO_LOGISTICA: { funcao: 'Encarregado de Logística', setor: 'LOGÍSTICA', directUserIdentity: true },
  ENCARREGADO_FRIGORIFICO: { funcao: 'Encarregado do Frigorífico', setor: 'FRIGORÍFICO', directUserIdentity: true },
  RH: { funcao: 'Responsável Administrativo / RH', setor: 'ADMINISTRATIVO', directUserIdentity: true },
});

function getRoleProfile(role) {
  const normalized = normalizeRole(role);
  if (normalized === 'SUPERVISOR_MANUTENCAO' || normalized === 'MANUTENCAO') {
    return ROLE_PROFILE.MANUTENCAO_SUPERVISOR;
  }
  if (normalized === 'ENCARREGADO' || normalized === 'ENCARREGADO_DE_MANUTENCAO') {
    return ROLE_PROFILE.ENCARREGADO_MANUTENCAO;
  }
  return ROLE_PROFILE[normalized] || null;
}

function isDirectUserIdentityRole(role) {
  return Boolean(getRoleProfile(role)?.directUserIdentity);
}

function deriveUserFunctionSector(role) {
  const profile = getRoleProfile(role);
  return {
    funcao: profile?.funcao || null,
    setor: profile?.setor || null,
  };
}

module.exports = {
  ROLE_PROFILE,
  normalizeRole,
  getRoleProfile,
  isDirectUserIdentityRole,
  deriveUserFunctionSector,
};
