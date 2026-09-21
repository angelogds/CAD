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
    ponto: 'Mancal / rolamento lado acionamento',
    metodo: 'Engraxar',
    instrucoes: 'Limpar a graxeira antes da aplicação. Aplicar somente o produto e a quantidade validados pelo PCM. Observar ruído, aquecimento, folga, vedação e vazamento.',
  },
  bearingNDE: {
    key: 'BEARING_NDE',
    ponto: 'Mancal / rolamento lado oposto',
    metodo: 'Engraxar',
    instrucoes: 'Limpar a graxeira antes da aplicação. Aplicar somente o produto e a quantidade validados pelo PCM. Observar ruído, aquecimento, folga, vedação e vazamento.',
  },
  reducer: {
    key: 'REDUCER_OIL',
    ponto: 'Redutor / motorredutor - nível e condição do óleo',
    metodo: 'Verificar / completar nível',
    instrucoes: 'Verificar vazamentos, nível e condição do óleo. Completar ou trocar somente com o lubrificante especificado pelo PCM e com o equipamento em condição segura.',
  },
  motorDE: {
    key: 'MOTOR_DE',
    ponto: 'Motor - rolamento lado acoplamento (LA)',
    metodo: 'Engraxar',
    instrucoes: 'Confirmar que o motor possui ponto de relubrificação. Limpar a graxeira e aplicar somente a graxa e a quantidade definidas na placa/manual e validadas pelo PCM. Não misturar graxas.',
  },
  motorNDE: {
    key: 'MOTOR_NDE',
    ponto: 'Motor - rolamento lado oposto (LOA)',
    metodo: 'Engraxar',
    instrucoes: 'Confirmar que o motor possui ponto de relubrificação. Limpar a graxeira e aplicar somente a graxa e a quantidade definidas na placa/manual e validadas pelo PCM. Não misturar graxas.',
  },
};

const RULES = [
  {
    familia: 'MOTORREDUTORES',
    rota: ROUTES.ACIONAMENTOS,
    ordem: 60,
    match: ['MOTORREDUTOR', 'MOTO REDUTOR'],
    pontos: [common.reducer, common.motorDE, common.motorNDE],
  },
  {
    familia: 'DIGESTORES',
    rota: ROUTES.DIGESTORES_PRENSAS,
    ordem: 10,
    match: ['DIGESTOR'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancal dianteiro do digestor' },
      { ...common.bearingNDE, ponto: 'Mancal traseiro do digestor' },
      { ...common.reducer, ponto: 'Redutor principal do digestor - nível e condição do óleo' },
      common.motorDE,
      common.motorNDE,
    ],
  },
  {
    familia: 'PRENSAS',
    rota: ROUTES.DIGESTORES_PRENSAS,
    ordem: 20,
    match: ['PRENSA', 'P50', 'P46'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancal / rolamento principal da prensa' },
      { ...common.reducer, ponto: 'Redutor principal da prensa - nível e condição do óleo' },
      common.motorDE,
      common.motorNDE,
    ],
  },
  {
    familia: 'ROSCAS',
    rota: ROUTES.TRANSPORTE,
    ordem: 30,
    match: ['ROSCA', 'TRANSPORTADOR HELICOIDAL', 'SEM FIM'],
    pontos: [common.bearingDE, common.bearingNDE, common.reducer, common.motorDE, common.motorNDE],
  },
  {
    familia: 'TOLVAS',
    rota: ROUTES.TRANSPORTE,
    ordem: 35,
    match: ['TOLVA'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancal da rosca da tolva - lado acionamento' },
      { ...common.bearingNDE, ponto: 'Mancal da rosca da tolva - lado oposto' },
      common.reducer,
      common.motorDE,
      common.motorNDE,
    ],
  },
  {
    familia: 'TRANSPORTE',
    rota: ROUTES.TRANSPORTE,
    ordem: 40,
    match: ['ESTEIRA', 'ELEVADOR', 'TRANSPORTADOR'],
    pontos: [common.bearingDE, common.bearingNDE, common.reducer, common.motorDE, common.motorNDE],
  },
  {
    familia: 'BOMBAS',
    rota: ROUTES.SEPARACAO,
    ordem: 42,
    match: ['BOMBA'],
    pontos: [common.bearingDE, common.bearingNDE, common.motorDE, common.motorNDE],
  },
  {
    familia: 'VALVULAS_ROTATIVAS',
    rota: ROUTES.TRANSPORTE,
    ordem: 43,
    match: ['VALVULA ROTATIVA'],
    pontos: [common.bearingDE, common.bearingNDE, common.reducer, common.motorDE, common.motorNDE],
  },
  {
    familia: 'ENSACADEIRAS',
    rota: ROUTES.TRANSPORTE,
    ordem: 44,
    match: ['ENSACADEIRA'],
    pontos: [common.bearingDE, common.bearingNDE, common.motorDE, common.motorNDE],
  },
  {
    familia: 'DECANTER',
    rota: ROUTES.SEPARACAO,
    ordem: 45,
    match: ['DECANTER'],
    pontos: [common.bearingDE, common.bearingNDE, common.motorDE, common.motorNDE],
  },
  {
    familia: 'PERCOLADORA',
    rota: ROUTES.SEPARACAO,
    ordem: 50,
    match: ['PERCOLADORA', 'PERCULADORA'],
    pontos: [common.bearingDE, common.bearingNDE, common.reducer, common.motorDE, common.motorNDE],
  },
  {
    familia: 'MOINHOS',
    rota: ROUTES.MOAGEM,
    ordem: 55,
    match: ['MOINHO'],
    pontos: [common.bearingDE, common.bearingNDE, common.motorDE, common.motorNDE],
  },
  {
    familia: 'TRITURADORES',
    rota: ROUTES.MOAGEM,
    ordem: 56,
    match: ['TRITURADOR'],
    pontos: [common.bearingDE, common.bearingNDE, common.motorDE, common.motorNDE],
  },
  {
    familia: 'FORNALHAS',
    rota: ROUTES.UTILIDADES,
    ordem: 70,
    match: ['FORNALHA'],
    pontos: [
      { ...common.bearingDE, ponto: 'Mancais do conjunto da fornalha - lado acionamento' },
      { ...common.bearingNDE, ponto: 'Mancais do conjunto da fornalha - lado oposto' },
      common.reducer,
      common.motorDE,
      common.motorNDE,
    ],
  },
  {
    familia: 'EXAUSTORES',
    rota: ROUTES.UTILIDADES,
    ordem: 75,
    match: ['EXAUSTOR'],
    pontos: [common.bearingDE, common.bearingNDE, common.motorDE, common.motorNDE],
  },
  {
    familia: 'MOTORES',
    rota: ROUTES.ACIONAMENTOS,
    ordem: 80,
    match: ['MOTOR'],
    pontos: [common.motorDE, common.motorNDE],
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
  if (proposed.key === 'REDUCER_OIL') {
    // Um ponto legado chamado apenas "Redutor" é tratado como equivalente para
    // evitar duplicidade. O PCM pode detalhar depois se houver mais de um redutor.
    return hasAny(existing, ['REDUTOR', 'MOTORREDUTOR']);
  }
  if (proposed.key === 'MOTOR_DE' || proposed.key === 'MOTOR_NDE') {
    // Cadastro legado frequentemente registra um único ponto "Rolamento do motor".
    // Na dúvida, não criamos pontos automáticos adicionais sobre ele.
    return existing.includes('MOTOR') && hasAny(existing, ['ROLAMENTO', 'MANCAL', 'GRAXEIRA']);
  }
  if (proposed.key === 'BEARING_DE' || proposed.key === 'BEARING_NDE') {
    // "Mancal principal" / "Rolamento principal" já representa um ponto existente.
    // Preferimos não duplicar automaticamente; o PCM pode desdobrar LA/LOA depois.
    return !existing.includes('MOTOR') && hasAny(existing, ['MANCAL', 'ROLAMENTO', 'GRAXEIRA']);
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

module.exports = {
  ROUTES,
  RULES,
  normalize,
  classificarEquipamento,
  gerarPontosBase,
  equivalentPoint,
  encontrarEquipamentoDoMotor,
};
