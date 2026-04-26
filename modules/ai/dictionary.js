const DICTIONARY = {
  queimou: 'falha elétrica',
  travou: 'falha mecânica',
  batendo: 'desalinhamento',
  vazando: 'falha de vedação',
};

const EQUIPMENT_NORMALIZATION = [
  { pattern: /\bdigestor\s+dois\b/gi, replace: 'Digestor 2' },
  { pattern: /\bprensa\s+cinquenta\b/gi, replace: 'Prensa P50' },
];

function normalizeVoiceTerms(text = '') {
  let out = String(text || '');
  for (const [term, normalized] of Object.entries(DICTIONARY)) {
    out = out.replace(new RegExp(`\\b${term}\\b`, 'gi'), normalized);
  }
  return out;
}

function normalizeEquipmentMention(text = '') {
  let out = String(text || '');
  for (const rule of EQUIPMENT_NORMALIZATION) out = out.replace(rule.pattern, rule.replace);
  return out;
}

module.exports = {
  DICTIONARY,
  normalizeVoiceTerms,
  normalizeEquipmentMention,
};
