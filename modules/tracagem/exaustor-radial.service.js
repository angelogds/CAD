function n2(v) { return Number(Number(v).toFixed(2)); }

function getUnidade(params = {}) {
  return params.unidade === 'cm' ? 'cm' : 'mm';
}

function medida(valor, unidade, nome, { opcional = false, defaultValue = null } = {}) {
  if ((valor === '' || valor === null || valor === undefined) && opcional) return defaultValue;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${nome} deve ser maior que zero.`);
  return unidade === 'cm' ? n * 10 : n;
}

function numero(valor, nome, padrao) {
  const bruto = (valor === '' || valor === null || valor === undefined) ? padrao : valor;
  const n = Number(bruto);
  if (!Number.isFinite(n)) throw new Error(`${nome} inválido.`);
  return n;
}

function inteiro(valor, nome, padrao, min) {
  const n = Number.parseInt((valor === '' || valor === null || valor === undefined) ? padrao : valor, 10);
  if (!Number.isFinite(n) || n < min) throw new Error(`${nome} deve ser inteiro maior ou igual a ${min}.`);
  return n;
}

function calcExaustorRadial(params = {}) {
  const unidade = getUnidade(params);
  const D = medida(params.D ?? params.diametroRotor, unidade, 'Diâmetro externo do rotor');
  const largura = medida(params.largura ?? params.B, unidade, 'Largura do rotor');
  const dCubo = medida(params.dCubo ?? params.diametroCubo, unidade, 'Diâmetro do cubo');
  const dEixo = medida(params.dEixo ?? params.diametroEixo, unidade, 'Diâmetro do eixo', { opcional: true, defaultValue: 0 });
  const espessura = medida(params.E ?? params.espessura, unidade, 'Espessura da chapa', { opcional: true, defaultValue: 0 });
  const N = inteiro(params.N ?? params.palhetas, 'Quantidade de palhetas', 12, 3);
  const divisoesVoluta = inteiro(params.divisoesVoluta, 'Divisões da voluta', 12, 4);

  if (dCubo >= D) throw new Error('O diâmetro do cubo deve ser menor que o diâmetro externo do rotor.');
  if (dEixo && dEixo >= dCubo) throw new Error('O diâmetro do eixo deve ser menor que o diâmetro do cubo.');

  const pct10 = numero(params.pct10, 'Percentual de 10%', 10);
  const pct90 = numero(params.pct90, 'Percentual de 90%', 90);
  const pct6 = numero(params.pct6, 'Percentual de 6%', 6);
  if (pct10 <= 0 || pct90 <= 0 || pct6 <= 0) throw new Error('Os percentuais do método prático devem ser maiores que zero.');

  const ref10 = D * (pct10 / 100);
  const ref90 = D * (pct90 / 100);
  const ref6 = D * (pct6 / 100);

  const aberturaVoluta = medida(
    params.aberturaVoluta,
    unidade,
    'Abertura máxima da voluta',
    { opcional: true, defaultValue: ref10 },
  );

  const raioRotor = D / 2;
  const raioCubo = dCubo / 2;
  const passoAngular = 360 / N;

  const palhetas = Array.from({ length: N }, (_, idx) => {
    const angulo = idx * passoAngular;
    const rad = (angulo * Math.PI) / 180;
    return {
      indice: idx + 1,
      angulo: n2(angulo),
      x1: n2(raioCubo * Math.cos(rad)),
      y1: n2(raioCubo * Math.sin(rad)),
      x2: n2(raioRotor * Math.cos(rad)),
      y2: n2(raioRotor * Math.sin(rad)),
    };
  });

  const pontosVoluta = Array.from({ length: divisoesVoluta + 1 }, (_, idx) => {
    const angulo = (360 / divisoesVoluta) * idx;
    const theta = (angulo * Math.PI) / 180;
    const raio = raioRotor + (aberturaVoluta * theta) / (2 * Math.PI);
    return {
      indice: idx + 1,
      angulo: n2(angulo),
      raio: n2(raio),
      x: n2(raio * Math.cos(theta)),
      y: n2(raio * Math.sin(theta)),
      abertura: n2(raio - raioRotor),
    };
  });

  for (let i = 1; i < pontosVoluta.length; i += 1) {
    if (pontosVoluta[i].raio < pontosVoluta[i - 1].raio) {
      throw new Error('Falha de consistência na espiral da voluta.');
    }
  }

  return {
    entrada: {
      D: n2(D),
      largura: n2(largura),
      dCubo: n2(dCubo),
      dEixo: n2(dEixo),
      E: n2(espessura),
      N,
      divisoesVoluta,
      pct10: n2(pct10),
      pct90: n2(pct90),
      pct6: n2(pct6),
      aberturaVoluta: n2(aberturaVoluta),
      unidadeEntrada: unidade,
      unidadeInterna: 'mm',
      anguloPalheta: 90,
    },
    resultado: {
      raioRotor: n2(raioRotor),
      raioCubo: n2(raioCubo),
      larguraRotor: n2(largura),
      passoAngular: n2(passoAngular),
      alturaRadialPalheta: n2(raioRotor - raioCubo),
      referencia10: n2(ref10),
      referencia90: n2(ref90),
      referencia6: n2(ref6),
      aberturaVoluta: n2(aberturaVoluta),
      raioFinalVoluta: n2(raioRotor + aberturaVoluta),
      palhetas,
      pontosVoluta,
    },
    planificacao: {
      labels: {
        D: n2(D),
        B: n2(largura),
        RC: n2(raioCubo),
        passoAngular: n2(passoAngular),
        P10: n2(ref10),
        P90: n2(ref90),
        P6: n2(ref6),
        aberturaVoluta: n2(aberturaVoluta),
      },
      pontos: pontosVoluta.map((p) => ({ nome: `V${p.indice}`, x: p.x, y: p.y })),
      linhas: palhetas.map((p) => ({ nome: `P${p.indice}`, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 })),
      divisoes: pontosVoluta,
      palhetas,
    },
    observacoes: [
      'Os percentuais 10% / 90% / 6% são parâmetros do método prático Campo do Gado e permanecem editáveis.',
      'A voluta geométrica é gerada por espiral de Arquimedes, com crescimento linear do raio em função do ângulo.',
      'Esta etapa dimensiona geometria para fabricação; não substitui dimensionamento aerodinâmico por vazão, pressão, rotação e potência.',
      'Após fabricação do rotor, prever conferência dimensional e balanceamento antes da operação.',
    ],
  };
}

module.exports = { calcExaustorRadial };
