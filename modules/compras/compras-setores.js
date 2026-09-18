function normalizeToken(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const SETORES = Object.freeze({
  RECICLAGEM: 'RECICLAGEM',
  LOGISTICA: 'LOGÍSTICA',
  FRIGORIFICO: 'FRIGORÍFICO',
  ADMINISTRATIVO: 'ADMINISTRATIVO',
});

const DB_ALIASES = Object.freeze({
  RECICLAGEM: [
    'RECICLAGEM', 'Reciclagem',
    'MANUTENÇÃO', 'Manutenção', 'MANUTENCAO', 'Manutencao',
    'MANUTENÇÃO INDUSTRIAL', 'Manutenção Industrial', 'MANUTENCAO INDUSTRIAL', 'Manutencao Industrial',
    'PRODUÇÃO', 'Produção', 'PRODUCAO', 'Producao',
  ],
  'LOGÍSTICA': ['LOGÍSTICA', 'Logística', 'LOGISTICA', 'Logistica', 'TRANSPORTE', 'Transporte', 'FROTA', 'Frota'],
  'FRIGORÍFICO': ['FRIGORÍFICO', 'Frigorífico', 'FRIGORIFICO', 'Frigorifico'],
  ADMINISTRATIVO: [
    'ADMINISTRATIVO', 'Administrativo',
    'ADMINISTRAÇÃO', 'Administração', 'ADMINISTRACAO', 'Administracao',
    'ADMINISTRATIVA', 'Administrativa', 'RH',
  ],
});

function normalizeSetorCorporativo(value) {
  const token = normalizeToken(value);
  if (!token) return '';
  if (['RECICLAGEM', 'MANUTENCAO', 'MANUTENCAO_INDUSTRIAL', 'PRODUCAO'].includes(token)) return SETORES.RECICLAGEM;
  if (['LOGISTICA', 'TRANSPORTE', 'FROTA'].includes(token)) return SETORES.LOGISTICA;
  if (token === 'FRIGORIFICO') return SETORES.FRIGORIFICO;
  if (['ADMINISTRATIVO', 'ADMINISTRACAO', 'ADMINISTRATIVA', 'RH'].includes(token)) return SETORES.ADMINISTRATIVO;
  return String(value || '').trim();
}

function setorMatches(value, selected) {
  if (!selected) return true;
  return normalizeSetorCorporativo(value) === normalizeSetorCorporativo(selected);
}

function dbAliasesForSetor(selected) {
  const canonical = normalizeSetorCorporativo(selected);
  return DB_ALIASES[canonical] ? [...DB_ALIASES[canonical]] : [String(selected || '').trim()].filter(Boolean);
}

module.exports = {
  SETORES,
  normalizeSetorCorporativo,
  setorMatches,
  dbAliasesForSetor,
};
