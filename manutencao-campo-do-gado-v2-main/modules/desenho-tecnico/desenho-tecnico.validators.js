const CATEGORIES = {
  EIXOS: ['PONTA_EIXO_PRINCIPAL', 'PONTA_EIXO_SECUNDARIA', 'PONTA_EIXO_EMENDA'],
  FLANGES: ['FLANGE_CIRCULAR', 'FLANGE_CEGO', 'FLANGE_FURACAO'],
  CHAPARIA: ['CHAPA_RETANGULAR', 'CHAPA_DOBRADA', 'BASE_SIMPLES'],
  ESTRUTURAS: ['MAO_FRANCESA', 'SUPORTE_SIMPLES', 'BASE_MANCAL'],
  TRANSICOES: ['QUADRADO_REDONDO', 'REDUCAO_CONCENTRICA'],
};

function asPositiveNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeParams(body = {}) {
  const params = {};
  for (const [k, v] of Object.entries(body)) {
    if (!k.startsWith('param_')) continue;
    const key = k.replace('param_', '');
    params[key] = asPositiveNumber(v);
  }
  return params;
}

function validateDrawingInput(body = {}) {
  const errors = [];
  const categoria = String(body.categoria || '').toUpperCase();
  const subtipo = String(body.subtipo || '').toUpperCase();
  const codigo = String(body.codigo || '').trim();
  const titulo = String(body.titulo || '').trim();

  if (!codigo) errors.push('Código é obrigatório.');
  if (!titulo) errors.push('Título é obrigatório.');
  if (!CATEGORIES[categoria]) errors.push('Categoria inválida.');
  if (CATEGORIES[categoria] && !CATEGORIES[categoria].includes(subtipo)) errors.push('Subtipo inválido para a categoria informada.');

  const params = normalizeParams(body);
  const invalidMeasures = Object.entries(params).filter(([, value]) => value != null && value < 0);
  if (invalidMeasures.length) errors.push('Não é permitido informar medidas negativas.');

  const zeros = Object.entries(params).filter(([name, value]) => value === 0 && /comprimento|altura|largura|diametro|raio|espessura|base/.test(name));
  if (zeros.length) errors.push('Medidas principais não podem ser zero.');

  if (params.diametroExterno != null && params.diametroInterno != null && params.diametroInterno >= params.diametroExterno) {
    errors.push('Diâmetro interno deve ser menor que o diâmetro externo.');
  }

  if (params.numeroFuros != null && params.numeroFuros > 0 && params.numeroFuros < 2) {
    errors.push('Quantidade de furos deve ser no mínimo 2 quando informada.');
  }

  return {
    valid: errors.length === 0,
    errors,
    params,
  };
}

module.exports = {
  CATEGORIES,
  validateDrawingInput,
  normalizeParams,
};
