function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROUTES = {
  DIGESTORES_PRENSAS: 'Rota 01 - Digestores e Prensas',
  TRANSPORTE: 'Rota 02 - Roscas, Tolvas e Transporte',
  SEPARACAO: 'Rota 03 - Decanter e Percoladora',
  MOAGEM: 'Rota 04 - Moinhos e Trituradores',
  UTILIDADES: 'Rota 05 - Fornalhas e Exaustores',
  ACIONAMENTOS: 'Rota 06 - Motores e Motorredutores',
};

const common = {
  bearingDE: {
    key: 'BEARING_DE',
    ponto: 'Mancal dianteiro / lado acionamento',
    metodo: 'Engraxar',
    instrucoes: 'Limpar a graxeira antes da aplicação. Aplicar somente o produto e a quantidade validados pelo PCM. Observar ruído, aquecimento, folga, vedação e vazamento.',
  },
  bearingNDE: {
    key: 'BEARING_NDE',
    ponto: 'Mancal traseiro / lado oposto',
    metodo: 'Engraxar',
    instrucoes: 'Limpar a graxeira antes da aplicação. Aplicar somente o produto e a quantidade validados pelo PCM. Observar ruído, aquecimento, folga, vedação e vazamento.',
  },
  reducer: {
    key: 'REDUCER_OIL',
    ponto: 'Redutor / motorredutor - verificar nível e condição do óleo',
    metodo: 'Verificar / completar nível',
    instrucoes: 'Verificar vazamentos, nível e condição do óleo. Completar ou trocar somente com o óleo especificado pelo PCM e com o equipamento em condição segura.',
  },
};

function twoBearings(prefix = '') {
  const label = String(prefix || '').trim();
  return [
    { ...common.bearingDE, ponto: label ? `Mancal dianteiro ${label}` : common.bearingDE.ponto },
    { ...common.bearingNDE, ponto: label ? `Mancal traseiro ${label}` : common.bearingNDE.ponto },
  ];
}

const RULES = [
  {
    familia: 'TANQUE_SERVICO_SECO',
    rota: ROUTES.TRANSPORTE,
    ordem: 26,
    match: ['TANQUE DE SERVICO SECO', 'TANQUE SERVICO SECO', 'TANQUE SECO'],
    pontos: [
      {
        ...common.bearingDE,
        key: 'BEARING_EXTERNAL',
        ponto: 'Mancal externo do tanque de serviço seco',
        instrucoes: 'Lubrificar somente o mancal externo. O mancal interno não entra no roteiro de engraxamento porque é lubrificado pelo próprio óleo do tanque. Aplicar somente produto e quantidade validados pelo PCM.',
      },
      {
        ...common.reducer,
        ponto: 'Redutor do tanque de serviço seco - verificar nível e condição do óleo',
      },
    ],
  },
  {
    familia: 'TRITURADOR_JULIANO',
    rota: ROUTES.MOAGEM,
    ordem: 56,
    match: ['TRITURADOR JULIANO', 'TRITURADOR JULIA', 'TRITURADOR JULIANA'],
    pontos: [
      ...twoBearings('do Triturador Juliano'),
      { ...common.reducer, ponto: 'Redutor do Triturador Juliano - verificar nível e condição do óleo' },
    ],
  },
  {
    familia: 'TRITURADOR_FAST',
    rota: ROUTES.MOAGEM,
    ordem: 57,
    match: ['TRITURADOR FAST'],
    pontos: [
      ...twoBearings('do Triturador FAST'),
    ],
  },
  {
    familia: 'MOTORREDUTORES',
    rota: ROUTES.ACIONAMENTOS,
    ordem: 60,
    match: ['MOTORREDUTOR', 'MOTO REDUTOR'],
    pontos: [common.reducer],
  },
  {
    familia: 'DIGESTORES',
    rota: ROUTES.DIGESTORES_PRENSAS,
    ordem: 10,
    match: ['DIGESTOR'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancal dianteiro do digestor' },
      { ...common.bearingNDE, ponto: 'Mancal traseiro do digestor' },
      { ...common.reducer, ponto: 'Redutor principal do digestor - verificar nível e condição do óleo' },
    ],
  },
  {
    familia: 'PRENSAS',
    rota: ROUTES.DIGESTORES_PRENSAS,
    ordem: 20,
    match: ['PRENSA', 'P50', 'P46'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancal dianteiro da prensa' },
      { ...common.bearingNDE, ponto: 'Mancal traseiro da prensa' },
      { ...common.reducer, ponto: 'Redutor principal da prensa - verificar nível e condição do óleo' },
    ],
  },
  {
    familia: 'TACHOS',
    rota: ROUTES.TRANSPORTE,
    ordem: 25,
    match: ['TACHO'],
    pontos: [
      ...twoBearings('do tacho'),
      { ...common.reducer, ponto: 'Redutor do tacho - verificar nível e condição do óleo' },
    ],
  },
  {
    familia: 'ROSCAS',
    rota: ROUTES.TRANSPORTE,
    ordem: 30,
    match: ['ROSCA', 'TRANSPORTADOR HELICOIDAL', 'SEM FIM'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancal dianteiro da rosca' },
      { ...common.bearingNDE, ponto: 'Mancal traseiro da rosca' },
      { ...common.reducer, ponto: 'Redutor / motorredutor da rosca - verificar nível e condição do óleo' },
    ],
  },
  {
    familia: 'TOLVAS',
    rota: ROUTES.TRANSPORTE,
    ordem: 35,
    match: ['TOLVA', 'MOEGA', 'AMOEGA'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancal dianteiro da rosca da tolva / moega' },
      { ...common.bearingNDE, ponto: 'Mancal traseiro da rosca da tolva / moega' },
      { ...common.reducer, ponto: 'Redutor / motorredutor da tolva / moega - verificar nível e condição do óleo' },
    ],
  },
  {
    familia: 'TRANSPORTE',
    rota: ROUTES.TRANSPORTE,
    ordem: 40,
    match: ['ESTEIRA', 'ELEVADOR', 'TRANSPORTADOR'],
    pontos: [common.bearingDE, common.bearingNDE, common.reducer],
  },
  {
    familia: 'BOMBAS',
    rota: ROUTES.SEPARACAO,
    ordem: 42,
    match: ['BOMBA'],
    pontos: [common.bearingDE, common.bearingNDE],
  },
  {
    familia: 'VALVULAS_ROTATIVAS',
    rota: ROUTES.TRANSPORTE,
    ordem: 43,
    match: ['VALVULA ROTATIVA'],
    pontos: [common.bearingDE, common.bearingNDE, common.reducer],
  },
  {
    familia: 'ENSACADEIRAS',
    rota: ROUTES.TRANSPORTE,
    ordem: 44,
    match: ['ENSACADEIRA'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancal dianteiro da ensacadeira' },
      { ...common.bearingNDE, ponto: 'Mancal traseiro da ensacadeira' },
    ],
  },
  {
    familia: 'DECANTER',
    rota: ROUTES.SEPARACAO,
    ordem: 45,
    match: ['DECANTER'],
    pontos: [
      {
        ...common.bearingDE,
        ponto: 'Mancal dianteiro do Decanter - graxa especial',
        instrucoes: 'Usar exclusivamente a graxa especial validada para o Decanter. Não substituir nem misturar com graxa de uso geral. Limpar a graxeira e registrar qualquer vazamento, aquecimento, ruído ou contaminação.',
      },
      {
        ...common.bearingNDE,
        ponto: 'Mancal traseiro do Decanter - graxa especial',
        instrucoes: 'Usar exclusivamente a graxa especial validada para o Decanter. Não substituir nem misturar com graxa de uso geral. Limpar a graxeira e registrar qualquer vazamento, aquecimento, ruído ou contaminação.',
      },
      {
        ...common.reducer,
        ponto: 'Caixa redutora do Decanter - verificar nível do óleo especial',
        instrucoes: 'Verificar nível, vazamentos e condição do óleo da caixa redutora. Usar exclusivamente o óleo especial validado para o Decanter. Não completar com óleo de outra especificação.',
      },
    ],
  },
  {
    familia: 'PERCOLADORA',
    rota: ROUTES.SEPARACAO,
    ordem: 50,
    match: ['PERCOLADORA', 'PERCULADORA'],
    pontos: [common.bearingDE, common.bearingNDE, common.reducer],
  },
  {
    familia: 'ESTERILIZADORES',
    rota: ROUTES.SEPARACAO,
    ordem: 52,
    match: ['ESTERILIZADOR'],
    pontos: [
      ...twoBearings('do esterilizador'),
      { ...common.reducer, ponto: 'Redutor do esterilizador - verificar nível e condição do óleo' },
    ],
  },
  {
    familia: 'MOINHOS',
    rota: ROUTES.MOAGEM,
    ordem: 55,
    match: ['MOINHO'],
    pontos: [common.bearingDE, common.bearingNDE],
  },
  {
    familia: 'TRITURADORES',
    rota: ROUTES.MOAGEM,
    ordem: 58,
    match: ['TRITURADOR'],
    pontos: [common.bearingDE, common.bearingNDE],
  },
  {
    familia: 'FORNALHAS',
    rota: ROUTES.UTILIDADES,
    ordem: 70,
    match: ['FORNALHA'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancal dianteiro do conjunto da fornalha' },
      { ...common.bearingNDE, ponto: 'Mancal traseiro do conjunto da fornalha' },
      { ...common.reducer, ponto: 'Redutor / motorredutor da fornalha - verificar nível e condição do óleo' },
    ],
  },
  {
    familia: 'EXAUSTORES',
    rota: ROUTES.UTILIDADES,
    ordem: 75,
    match: ['EXAUSTOR'],
    pontos: [common.bearingDE, common.bearingNDE],
  },
];

function equipmentHaystack(equipamento = {}) {
  return normalize([
    equipamento.tipo,
    equipamento.nome,
    equipamento.setor,
    equipamento.codigo,
    equipamento.tag,
  ].filter(Boolean).join(' '));
}

function classificarEquipamento(equipamento = {}) {
  const hay = equipmentHaystack(equipamento);
  if (!hay) return null;
  return RULES.find((rule) => rule.match.some((term) => hay.includes(normalize(term)))) || null;
}

function gerarPontosBase(equipamento = {}) {
  const rule = classificarEquipamento(equipamento);
  if (!rule) return [];
  return rule.pontos.map((point, index) => ({
    ...point,
    familia_lubrificacao: rule.familia,
    rota_lubrificacao: rule.rota,
    ordem_rota: rule.ordem * 100 + index + 1,
  }));
}

function equivalentPoint(existingName, proposed = {}) {
  const existing = normalize(existingName);
  if (!existing) return false;
  const proposedName = normalize(proposed.ponto);
  if (existing === proposedName) return true;

  const hasAny = (text, terms) => terms.some((term) => text.includes(term));
  const isBearing = hasAny(existing, ['MANCAL', 'ROLAMENTO', 'GRAXEIRA']);
  const isMotorBearing = existing.includes('MOTOR') && isBearing;
  const isFront = hasAny(existing, ['DIANTEIRO', 'ACIONAMENTO', 'ENTRADA', 'EXTERNO']);
  const isRear = hasAny(existing, ['TRASEIRO', 'OPOSTO', 'SAIDA', 'INTERNO']);

  if (proposed.key === 'REDUCER_OIL') {
    return hasAny(existing, ['REDUTOR', 'MOTORREDUTOR', 'CAIXA REDUTORA']);
  }
  if (proposed.key === 'BEARING_EXTERNAL') {
    return isBearing && hasAny(existing, ['EXTERNO', 'DIANTEIRO', 'ACIONAMENTO']);
  }
  if (proposed.key === 'BEARING_DE') {
    // Um ponto legado genérico de mancal conta como o primeiro mancal.
    return !isMotorBearing && isBearing && (isFront || (!isFront && !isRear));
  }
  if (proposed.key === 'BEARING_NDE') {
    // Para famílias com eixo e dois mancais, um ponto genérico não pode bloquear
    // a criação do segundo mancal.
    return !isMotorBearing && isBearing && isRear;
  }
  if (proposed.key === 'MOTOR_RELUB') {
    return isMotorBearing || (existing.includes('MOTOR') && existing.includes('LUBR'));
  }
  return false;
}

function motorMatchScore(motor = {}, equipamento = {}) {
  const local = normalize(motor.local_instalacao);
  if (!local) return 0;
  const nome = normalize(equipamento.nome);
  const codigo = normalize(equipamento.codigo);
  const tag = normalize(equipamento.tag);
  if (codigo && local === codigo) return 120;
  if (tag && local === tag) return 120;
  if (nome && local === nome) return 110;
  if (codigo && codigo.length >= 3 && local.includes(codigo)) return 100;
  if (tag && tag.length >= 3 && local.includes(tag)) return 100;
  if (nome && nome.length >= 5 && local.includes(nome)) return 90;
  if (nome && local.length >= 5 && nome.includes(local)) return 80;
  return 0;
}

function encontrarEquipamentoDoMotor(motor = {}, equipamentos = []) {
  const scored = equipamentos
    .map((equipamento) => ({ equipamento, score: motorMatchScore(motor, equipamento) }))
    .filter((item) => item.score >= 80)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].equipamento;
}

function pontoMotor20Cv(motor = {}) {
  const codigo = String(motor.codigo || motor.descricao || `#${motor.id || ''}`).trim();
  return {
    key: 'MOTOR_RELUB',
    ponto: `Motor ${codigo} - ponto de relubrificação do(s) rolamento(s)`,
    metodo: 'Engraxar',
    familia_lubrificacao: 'MOTORES_20CV',
    rota_lubrificacao: ROUTES.ACIONAMENTOS,
    ordem_rota: 8001,
    instrucoes: 'Aplicável a motor em uso com potência cadastrada a partir de 20 CV. Confirmar no motor quais rolamentos possuem ponto de relubrificação, a graxa correta, a quantidade e o intervalo antes de liberar para execução.',
  };
}

module.exports = {
  ROUTES,
  RULES,
  normalize,
  classificarEquipamento,
  gerarPontosBase,
  equivalentPoint,
  encontrarEquipamentoDoMotor,
  pontoMotor20Cv,
};
