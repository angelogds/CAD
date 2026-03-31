const IA_RESULT_REQUIRED_FIELDS = [
  'resumo_usuario',
  'descricao_tecnica',
  'acao_corretiva',
  'acao_preventiva',
  'materiais_citados',
  'tipo_intervencao',
  'confianca',
  'observacao_ia',
];

const IA_RESULT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: IA_RESULT_REQUIRED_FIELDS,
  properties: {
    resumo_usuario: { type: 'string' },
    descricao_tecnica: { type: 'string' },
    acao_corretiva: { type: 'string' },
    acao_preventiva: { type: 'string' },
    materiais_citados: {
      type: 'array',
      items: { type: 'string' },
    },
    tipo_intervencao: { type: 'string' },
    confianca: { type: 'number', minimum: 0, maximum: 100 },
    observacao_ia: { type: 'string' },
  },
};

module.exports = {
  IA_RESULT_REQUIRED_FIELDS,
  IA_RESULT_JSON_SCHEMA,
};
