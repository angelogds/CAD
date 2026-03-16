const db = require('../../database/db');

const TIPOS = {
  ROSCA_HELICOIDAL: 'rosca-helicoidal',
  FURACAO_FLANGE: 'furacao-flange',
  CILINDRO: 'cilindro',
  CURVA_GOMOS: 'curva-gomos',
  QUADRADO_PARA_REDONDO: 'quadrado-para-redondo',
  REDUCAO_CONCENTRICA: 'reducao-concentrica',
  SEMI_CILINDRO: 'semi-cilindro',
  BOCA_DE_LOBO_EXCENTRICA: 'boca-de-lobo-excentrica',
  BOCA_DE_LOBO_45: 'boca-de-lobo-45',
  BOCA_DE_LOBO_90: 'boca-de-lobo-90',
  MAO_FRANCESA: 'mao-francesa',
};

function n2(v) { return Number(Number(v).toFixed(2)); }
function n4(v) { return Number(Number(v).toFixed(4)); }

function assertFinite(nome, valor) {
  if (!Number.isFinite(valor)) {
    throw new Error(`Erro de cálculo em ${nome}. Verifique os dados informados.`);
  }
  return valor;
}

function normalizarMedida(valor, unidade = 'mm') {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Informe uma medida válida maior que zero.');
  }
  return unidade === 'cm' ? n * 10 : n;
}

function normalizarEspessura(valor, unidade = 'mm') {
  if (valor === '' || valor === null || valor === undefined) return 0;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Espessura inválida.');
  }
  return unidade === 'cm' ? n * 10 : n;
}

function getUnidade(params = {}) {
  return params.unidade === 'cm' ? 'cm' : 'mm';
}

function toEvenInt(value, nome, { min = 8, allowedAnyEven = false } = {}) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`${nome} deve ser inteiro maior ou igual a ${min}.`);
  }
  if (!allowedAnyEven && ![8, 12, 16, 24].includes(n)) {
    throw new Error('Recomendado usar 12, 16 ou 24 divisões.');
  }
  if (allowedAnyEven && n % 2 !== 0) {
    throw new Error(`${nome} deve ser inteiro par.`);
  }
  return n;
}

function toIntMin(value, nome, min) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`${nome} deve ser inteiro maior ou igual a ${min}.`);
  }
  return n;
}

function safeSqrt(v, nome) {
  if (v < 0) throw new Error(`Geometria inválida para os valores informados.`);
  return assertFinite(nome, Math.sqrt(v));
}

function emptyPlanificacao() {
  return { labels: {}, pontos: [], linhas: [], divisoes: [] };
}

function buildResult({ entrada, resultado, planificacao, observacoes }) {
  return {
    entrada,
    resultado,
    planificacao: planificacao || emptyPlanificacao(),
    observacoes: observacoes || [],
  };
}

function validarPlanificacaoCurvaGomos(divisoes, N) {
  if (!Array.isArray(divisoes) || divisoes.length !== N) {
    throw new Error('Falha de consistência: quantidade de medidas diferente do número de divisões.');
  }

  const alturas = divisoes.map((item) => Number(item.altura));
  if (alturas.some((item) => !Number.isFinite(item))) {
    throw new Error('Falha de consistência: medidas da planificação inválidas.');
  }

  const tolerance = 0.2;
  for (let i = 0; i < Math.floor(N / 2); i += 1) {
    const left = alturas[i];
    const right = alturas[N - i - 1];
    if (Math.abs(left - right) > tolerance) {
      throw new Error('Falha de consistência: as medidas da planificação não ficaram simétricas.');
    }
  }

  const centro = Math.floor(N / 2);
  for (let i = 1; i < centro; i += 1) {
    if (alturas[i] + tolerance < alturas[i - 1]) {
      throw new Error('Falha de consistência: sequência de medidas não evolui corretamente até o centro.');
    }
  }
}

function calcRoscaHelicoidal(params) {
  const unidade = getUnidade(params);
  const D = normalizarMedida(params.D, unidade);
  const d = normalizarMedida(params.d, unidade);
  const P = normalizarMedida(params.P, unidade);
  const E = normalizarEspessura(params.E, unidade);
  const voltas = params.voltas ? toIntMin(params.voltas, 'voltas', 1) : 1;
  const folgaSolda = normalizarEspessura(params.folgaSolda, unidade);

  if (D <= d) throw new Error('D deve ser maior que d.');

  const L_ext = safeSqrt((Math.PI * D) ** 2 + P ** 2, 'L_ext');
  const L_int = safeSqrt((Math.PI * d) ** 2 + P ** 2, 'L_int');
  const w = (D - d) / 2;
  const k = assertFinite('k', L_ext / L_int);
  if (k <= 1) throw new Error('Geometria inválida para os valores informados.');
  const R2_dev = assertFinite('R2_dev', w / (k - 1));
  const R1_dev = assertFinite('R1_dev', k * R2_dev);
  const angulo_rad = assertFinite('angulo_rad', L_ext / R1_dev);
  const angulo_dev = assertFinite('angulo_dev', (angulo_rad * 180) / Math.PI);
  const comprimentoTotal = assertFinite('comprimento_total', L_ext * voltas + folgaSolda);

  return buildResult({
    entrada: { D: n2(D), d: n2(d), P: n2(P), E: n2(E), voltas, folgaSolda: n2(folgaSolda), unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: {
      R1_dev: n2(R1_dev),
      R2_dev: n2(R2_dev),
      C1: n2(L_ext),
      T: n2(w),
      angulo_dev: n2(angulo_dev),
      L_ext: n2(L_ext),
      L_int: n2(L_int),
      largura_pa: n2(w),
      passo: n2(P),
      comprimento_1_volta: n2(L_ext),
      comprimento_total: n2(comprimentoTotal),
    },
    planificacao: {
      labels: { R1_dev: n2(R1_dev), R2_dev: n2(R2_dev), angulo_dev: n2(angulo_dev) },
      pontos: [],
      linhas: [],
      divisoes: [{ indice: 1, medida: n2(L_ext) }],
    },
    observacoes: [
      'Use D como diâmetro externo da hélice, d como diâmetro do tubo e P como passo entre espiras.',
      'Conferir folga, solda, sentido de montagem e espessura da chapa antes do corte final.',
    ],
  });
}

function calcFuracaoFlange(params) {
  const unidade = getUnidade(params);
  const PCD = normalizarMedida(params.PCD ?? params.D, unidade);
  const N = toIntMin(params.N ?? params.furos, 'N', 3);
  const anguloInicial = Number(params.anguloInicial ?? 0);
  if (!Number.isFinite(anguloInicial)) throw new Error('Ângulo inicial inválido.');
  const diametroFuro = params.diametroFuro ? normalizarMedida(params.diametroFuro, unidade) : null;

  const raio = PCD / 2;
  const theta = 360 / N;
  const corda = 2 * raio * Math.sin(Math.PI / N);

  const furos = Array.from({ length: N }, (_, i) => {
    const ang = anguloInicial + i * theta;
    const rad = (ang * Math.PI) / 180;
    return { furo: i + 1, angulo: n2(ang), x: n2(raio * Math.cos(rad)), y: n2(raio * Math.sin(rad)) };
  });

  return buildResult({
    entrada: { PCD: n2(PCD), N, anguloInicial: n2(anguloInicial), diametroFuro: diametroFuro ? n2(diametroFuro) : null, unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: { raio: n2(raio), anguloEntreFuros: n2(theta), corda: n2(corda), coordenadas: furos, tabelaFuros: furos },
    planificacao: {
      labels: { PCD: n2(PCD), N, anguloEntreFuros: n2(theta), corda: n2(corda) },
      pontos: furos.map((f) => ({ nome: `F${f.furo}`, x: f.x, y: f.y })),
      linhas: [],
      divisoes: furos.map((f) => ({ indice: f.furo, angulo: f.angulo })),
    },
    observacoes: ['Divisão angular uniforme no PCD para marcação dos furos.'],
  });
}

function calcCilindro(params) {
  const unidade = getUnidade(params);
  const D = normalizarMedida(params.D, unidade);
  const h = normalizarMedida(params.h ?? params.H, unidade);
  const E = normalizarEspessura(params.E, unidade);
  const folgaSolda = normalizarEspessura(params.folgaSolda, unidade);
  const A = Math.PI * D;
  const B = h;
  const area = A * B;

  return buildResult({
    entrada: { D: n2(D), h: n2(h), E: n2(E), folgaSolda: n2(folgaSolda), unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: { A: n2(A), B: n2(B), comprimento: n2(A), comprimentoChapa: n2(A), comprimentoComFolga: n2(A + folgaSolda), area: n2(area) },
    planificacao: { labels: { A: n2(A), B: n2(B) }, pontos: [], linhas: [], divisoes: [] },
    observacoes: ['A = πD e B = altura útil da chapa.'],
  });
}

function calcCurvaGomos(params) {
  const unidade = getUnidade(params);
  const D = normalizarMedida(params.D ?? params.diametro, unidade);
  const R = normalizarMedida(params.R, unidade);
  const angulo = Number(params.A ?? params.angulo);
  const E = normalizarEspessura(params.E, unidade);
  const G = toIntMin(params.G ?? params.gomos, 'G', 2);
  const N = toEvenInt(params.N ?? params.divisoes ?? 12, 'N', { min: 8, allowedAnyEven: true });
  if (angulo <= 0 || angulo > 180) throw new Error('Ângulo deve ser > 0 e <= 180.');
  if (R <= D / 2) throw new Error('R deve ser maior que o raio do tubo (D/2).');

  const beta = angulo / G;
  const anguloMitra = beta / 2;
  const comprimentoTotal = Math.PI * D;
  const larguraDivisao = comprimentoTotal / N;
  const pontos = [];
  const divisoes = [];
  const rc = D / 2;
  const betaRad = (beta * Math.PI) / 180;

  for (let i = 1; i <= N; i += 1) {
    const theta = (2 * Math.PI * (i - 1)) / Math.max(N - 1, 1);
    const y = rc * Math.cos(theta);
    const termo = (R * Math.tan(betaRad / 2)) - (y * Math.sin(betaRad / 2));
    const h = assertFinite('altura_divisao', termo * 2);
    divisoes.push({ indice: i, medida: n2((i - 1) * larguraDivisao), altura: n2(h) });
  }

  for (let i = 0; i <= N; i += 1) {
    const item = divisoes[i % N];
    pontos.push({ indice: i, x: n2(i * larguraDivisao), y: n2(item.altura) });
  }

  validarPlanificacaoCurvaGomos(divisoes, N);

  const medidasA = divisoes.slice(0, 7).map((p, idx) => ({ indice: idx + 1, valor: n2(p.altura) }));
  const planificacao = {
    comprimentoTotal: n2(comprimentoTotal),
    larguraDivisao: n2(larguraDivisao),
    numeroDivisoes: N,
    medidas: divisoes.map((item) => n2(item.altura)),
    pontos,
    divisoes,
    labels: { D: n2(D), R: n2(R), A: n2(angulo), G, N, P: n2(comprimentoTotal), A_div: n2(larguraDivisao) },
    linhas: [],
  };

  return buildResult({
    entrada: { D: n2(D), R: n2(R), A: n2(angulo), E: n2(E), G, N, unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: {
      anguloPorGomo: n2(beta),
      anguloMitra: n2(anguloMitra),
      perimetro: n2(comprimentoTotal),
      passe: n2(larguraDivisao),
      passoDivisao: n2(larguraDivisao),
      desenvolvimentoGomo: n2(comprimentoTotal / G),
      comprimentoTotal: n2(comprimentoTotal),
      larguraDivisao: n2(larguraDivisao),
      medidasA,
      A1: medidasA[0]?.valor || 0,
      A2: medidasA[1]?.valor || 0,
      A3: medidasA[2]?.valor || 0,
      A4: medidasA[3]?.valor || 0,
      A5: medidasA[4]?.valor || 0,
      A6: medidasA[5]?.valor || 0,
      A7: medidasA[6]?.valor || 0,
    },
    planificacao,
    observacoes: ['Para melhor precisão, usar 12 divisões no mínimo. Para acabamento fino, usar 24 divisões.'],
  });
}

function calcQuadradoParaRedondo(params) {
  const unidade = getUnidade(params);
  const A = normalizarMedida(params.A ?? params.ladoQuadrado ?? params.lado, unidade);
  const B = normalizarMedida(params.B ?? params.ladoRetangulo ?? params.lado2, unidade);
  const D = normalizarMedida(params.D ?? params.diametro, unidade);
  const H = normalizarMedida(params.H ?? params.h ?? params.altura, unidade);
  const E = normalizarEspessura(params.E, unidade);
  const N = toIntMin(params.N ?? 12, 'N', 4);

  const r = D / 2;
  const perimetroRetangulo = 2 * (A + B);
  const perimetroQuadradoReferencia = A * 4;
  const circunferenciaRedondo = Math.PI * D;
  const cTrecho = circunferenciaRedondo / N;

  function pontoNoRetanguloPorArco(sArco) {
    const p = ((sArco % perimetroRetangulo) + perimetroRetangulo) % perimetroRetangulo;
    const metadeA = A / 2;
    const metadeB = B / 2;

    if (p <= A) return { x: -metadeA + p, y: -metadeB };
    if (p <= A + B) return { x: metadeA, y: -metadeB + (p - A) };
    if (p <= (2 * A) + B) return { x: metadeA - (p - (A + B)), y: metadeB };
    return { x: -metadeA, y: metadeB - (p - ((2 * A) + B)) };
  }

  const pontos = [];
  for (let i = 0; i < N; i += 1) {
    const t = (2 * Math.PI * i) / N;
    const xr = r * Math.cos(t);
    const yr = r * Math.sin(t);
    const pTopo = pontoNoRetanguloPorArco(i * (perimetroRetangulo / N));
    const trueLength = safeSqrt(H ** 2 + (pTopo.x - xr) ** 2 + (pTopo.y - yr) ** 2, 'true_length');
    pontos.push({
      indice: i + 1,
      trueLength: n2(trueLength),
      x: n2(i * cTrecho),
      y: n2(trueLength),
      xTopo: n2(pTopo.x),
      yTopo: n2(pTopo.y),
      xBase: n2(xr),
      yBase: n2(yr),
    });
  }

  const comprimentos = pontos.map((p) => p.trueLength);
  const mediaCantos = [0, Math.floor(N / 4), Math.floor(N / 2), Math.floor((3 * N) / 4)]
    .map((idx) => comprimentos[idx] || comprimentos[0] || 0);
  const segmentosC = Array.from({ length: Math.min(4, N) }, (_, idx) => ({
    trecho: `${idx + 1}-${(idx + 2) <= N ? idx + 2 : 1}`,
    valor: n2(cTrecho),
  }));
  const geratrizAproximada = comprimentos.reduce((acc, v) => acc + v, 0) / (comprimentos.length || 1);

  return buildResult({
    entrada: { A: n2(A), B: n2(B), D: n2(D), H: n2(H), E: n2(E), N, unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: {
      perimetroRetangulo: n2(perimetroRetangulo),
      perimetroQuadrado: n2(perimetroQuadradoReferencia),
      circunferenciaRedondo: n2(circunferenciaRedondo),
      geratrizAproximada: n2(geratrizAproximada),
      C: n2(cTrecho),
      C1: segmentosC[0]?.valor || 0,
      C2: segmentosC[1]?.valor || 0,
      C3: segmentosC[2]?.valor || 0,
      C4: segmentosC[3]?.valor || 0,
      comprimentosVerdadeiros: comprimentos,
      AA: n2(A),
      AB: n2(B),
      A1: n2(mediaCantos[0]),
      A2: n2(mediaCantos[1]),
      A3: n2(mediaCantos[2]),
      A4: n2(mediaCantos[3]),
    },
    planificacao: {
      labels: {
        A: n2(A),
        B: n2(B),
        D: n2(D),
        H: n2(H),
        AA: n2(A),
        AB: n2(B),
        C: n2(cTrecho),
        A1: n2(mediaCantos[0]),
        A2: n2(mediaCantos[1]),
        A3: n2(mediaCantos[2]),
        A4: n2(mediaCantos[3]),
      },
      pontos,
      linhas: [],
      segmentosC,
      divisoes: pontos.map((ponto, idx) => ({
        indice: ponto.indice,
        trecho: `${ponto.indice}-${((idx + 1) % N) + 1}`,
        cTrecho: n2(cTrecho),
        altura: ponto.trueLength,
      })),
    },
    observacoes: [
      'As geratrizes foram calculadas por triangulação ponto a ponto entre retângulo e redondo.',
      'C representa o passo da planificação entre divisões sucessivas na base redonda.',
    ],
  });
}

function calcReducaoConcentrica(params) {
  const unidade = getUnidade(params);
  const D1 = normalizarMedida(params.D1 ?? params.dMaior, unidade);
  const D2 = normalizarMedida(params.D2 ?? params.dMenor, unidade);
  const h = normalizarMedida(params.h ?? params.H ?? params.altura, unidade);
  const E = normalizarEspessura(params.E, unidade);
  const folgaSolda = normalizarEspessura(params.folgaSolda, unidade);

  if (D1 <= D2) {
    if (D1 === D2) throw new Error('Se D1 e D2 são iguais, use o módulo de cilindro.');
    throw new Error('D1 deve ser maior que D2.');
  }

  const r1 = D1 / 2;
  const r2 = D2 / 2;
  const L = safeSqrt(h ** 2 + (r1 - r2) ** 2, 'geratriz');
  const R_setor_ext = assertFinite('R_setor_ext', (L * r1) / (r1 - r2));
  const R_setor_int = assertFinite('R_setor_int', (L * r2) / (r1 - r2));
  const angulo_setor = assertFinite('angulo_setor', 360 * (r1 / R_setor_ext));

  return buildResult({
    entrada: { D1: n2(D1), D2: n2(D2), h: n2(h), E: n2(E), folgaSolda: n2(folgaSolda), unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: {
      R1: n2(r1), R2: n2(r2), geratriz: n2(L), R_setor_ext: n2(R_setor_ext), R_setor_int: n2(R_setor_int), angulo_setor: n2(angulo_setor),
      C1: n2(Math.PI * D1), C2: n2(Math.PI * D2), T: n2(L + folgaSolda),
    },
    planificacao: { labels: { R_setor_ext: n2(R_setor_ext), R_setor_int: n2(R_setor_int), angulo_setor: n2(angulo_setor) }, pontos: [], linhas: [], divisoes: [] },
    observacoes: ['Se os dois diâmetros forem iguais, use o módulo Cilindro.'],
  });
}

function calcSemiCilindro(params) {
  const unidade = getUnidade(params);
  const D = normalizarMedida(params.D ?? params.diametro, unidade);
  const H = normalizarMedida(params.H ?? params.h ?? params.comprimento, unidade);
  const E = normalizarEspessura(params.E, unidade);
  const folgaSolda = normalizarEspessura(params.folgaSolda, unidade);

  const meiaCircunferencia = (Math.PI * D) / 2;
  const comprimentoChapa = meiaCircunferencia + folgaSolda;
  const area = meiaCircunferencia * H;

  return buildResult({
    entrada: { D: n2(D), H: n2(H), E: n2(E), folgaSolda: n2(folgaSolda), unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: { meiaCircunferencia: n2(meiaCircunferencia), comprimentoChapa: n2(comprimentoChapa), area: n2(area) },
    planificacao: emptyPlanificacao(),
    observacoes: [],
  });
}

function gerarIntersecaoBoca({ D, d, angulo, N, C = 0 }) {
  const R = D / 2;
  const r = d / 2;
  const alpha = (angulo * Math.PI) / 180;
  if (alpha <= 0 || alpha > Math.PI / 2) throw new Error('Ângulo deve estar entre 0 e 90 graus.');
  const pts = [];
  for (let i = 0; i <= N; i += 1) {
    const t = (2 * Math.PI * i) / N;
    const x = r * Math.cos(t) + C;
    const z = r * Math.sin(t);
    const inside = R ** 2 - x ** 2;
    if (inside < 0) throw new Error('Geometria inválida para os valores informados.');
    const y = (Math.sqrt(inside) - z * Math.cos(alpha)) / Math.sin(alpha);
    pts.push({ indice: i, xPlano: n2((Math.PI * d * i) / N), altura: n2(y) });
  }
  return pts;
}

function calcBocaLobo90(params) {
  const unidade = getUnidade(params);
  const D = normalizarMedida(params.D ?? params.D1 ?? params.dPrincipal, unidade);
  const d = normalizarMedida(params.d ?? params.D2 ?? params.dDerivacao, unidade);
  const h = normalizarEspessura(params.h, unidade);
  const E = normalizarEspessura(params.E, unidade);
  const N = toEvenInt(params.N ?? 12, 'N', { min: 8, allowedAnyEven: true });

  const pontos = gerarIntersecaoBoca({ D, d, angulo: 90, N });
  const R1 = D / 2;
  const R2 = d / 2;
  return buildResult({
    entrada: { D: n2(D), d: n2(d), h: n2(h), E: n2(E), N, unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: { R1: n2(R1), R2: n2(R2), P: n2(Math.PI * d), A: n2((Math.PI * d) / N), alturas: pontos.map((p) => p.altura), pontos },
    planificacao: { labels: { D: n2(D), d: n2(d), N }, pontos, linhas: [], divisoes: pontos },
    observacoes: ['Os cálculos são gerados por pontos. Sempre conferir posição de montagem antes do corte.'],
  });
}

function calcBocaLobo45(params) {
  const unidade = getUnidade(params);
  const D = normalizarMedida(params.D ?? params.dPrincipal, unidade);
  const d = normalizarMedida(params.d ?? params.dDerivacao, unidade);
  const h = normalizarEspessura(params.h, unidade);
  const E = normalizarEspessura(params.E, unidade);
  const alpha = Number(params.alpha ?? params.α ?? 45);
  const N = toEvenInt(params.N ?? 12, 'N', { min: 8, allowedAnyEven: true });

  const pontos = gerarIntersecaoBoca({ D, d, angulo: alpha, N });
  return buildResult({
    entrada: { D: n2(D), d: n2(d), h: n2(h), alpha: n2(alpha), E: n2(E), N, unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: { desenvolvimento: n2(Math.PI * d), alturas: pontos.map((p) => p.altura), pontos },
    planificacao: { labels: { D: n2(D), d: n2(d), alpha: n2(alpha) }, pontos, linhas: [], divisoes: pontos },
    observacoes: ['Os cálculos são gerados por pontos. Sempre conferir posição de montagem antes do corte.'],
  });
}

function calcBocaLoboExcentrica(params) {
  const unidade = getUnidade(params);
  const D = normalizarMedida(params.D ?? params.D1 ?? params.dPrincipal, unidade);
  const d = normalizarMedida(params.d ?? params.D2 ?? params.dDerivacao, unidade);
  const h = normalizarEspessura(params.h ?? params.H ?? params.altura, unidade);
  const C = normalizarEspessura(params.C ?? params.X ?? params.deslocamento, unidade);
  const E = normalizarEspessura(params.E, unidade);
  const N = toEvenInt(params.N ?? 12, 'N', { min: 8, allowedAnyEven: true });

  if (Math.abs(C) >= (D - d) / 2) throw new Error('Geometria inválida para os valores informados.');

  const pontos = gerarIntersecaoBoca({ D, d, angulo: 90, N, C });
  const R1 = D / 2;
  const R2 = d / 2;
  const geratrizAproximada = pontos.reduce((acc, p) => acc + Math.abs(p.altura), 0) / (pontos.length || 1);
  return buildResult({
    entrada: { D: n2(D), d: n2(d), h: n2(h), C: n2(C), E: n2(E), N, unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: {
      R1: n2(R1),
      R2: n2(R2),
      deslocamento: n2(C),
      geratrizAproximada: n2(geratrizAproximada),
      P: n2(Math.PI * d),
      A: n2((Math.PI * d) / N),
      alturas: pontos.map((p) => p.altura),
      pontos,
    },
    planificacao: { labels: { D: n2(D), d: n2(d), C: n2(C), N }, pontos, linhas: [], divisoes: pontos },
    observacoes: ['Os cálculos são gerados por pontos. Sempre conferir posição de montagem antes do corte.'],
  });
}

function calcMaoFrancesa(params) {
  const unidade = getUnidade(params);
  const A = normalizarMedida(params.A ?? params.base ?? params.largura, unidade);
  const h = normalizarMedida(params.h ?? params.altura ?? params.comprimento, unidade);
  const E = normalizarEspessura(params.E, unidade);

  const C = safeSqrt(A ** 2 + h ** 2, 'C');
  const alpha = (Math.atan(h / A) * 180) / Math.PI;

  return buildResult({
    entrada: { A: n2(A), h: n2(h), E: n2(E), unidadeEntrada: unidade, unidadeInterna: 'mm' },
    resultado: { C: n2(C), alpha: n2(alpha), B: n2(E), D: n2(E) },
    planificacao: emptyPlanificacao(),
    observacoes: [],
  });
}

function calcularPorTipo(tipo, params) {
  switch (tipo) {
    case TIPOS.ROSCA_HELICOIDAL: return calcRoscaHelicoidal(params);
    case TIPOS.FURACAO_FLANGE: return calcFuracaoFlange(params);
    case TIPOS.CILINDRO: return calcCilindro(params);
    case TIPOS.CURVA_GOMOS: return calcCurvaGomos(params);
    case TIPOS.QUADRADO_PARA_REDONDO: return calcQuadradoParaRedondo(params);
    case TIPOS.REDUCAO_CONCENTRICA: return calcReducaoConcentrica(params);
    case TIPOS.SEMI_CILINDRO: return calcSemiCilindro(params);
    case TIPOS.BOCA_DE_LOBO_EXCENTRICA: return calcBocaLoboExcentrica(params);
    case TIPOS.BOCA_DE_LOBO_45: return calcBocaLobo45(params);
    case TIPOS.BOCA_DE_LOBO_90: return calcBocaLobo90(params);
    case TIPOS.MAO_FRANCESA:
    case 'pao-francesa': return calcMaoFrancesa(params);
    case 'boca-de-lobo-45-graus': return calcBocaLobo45(params);
    case 'boca-de-lobo-90-graus': return calcBocaLobo90(params);
    default: throw new Error('Tipo de traçagem inválido.');
  }
}


function mapModuloOrigem(tipo) {
  return String(tipo || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
}

function buildDadosCalculoJson(parametros = {}, resultado = {}) {
  return {
    parametros,
    resultados: resultado,
    unidade: parametros.unidade || resultado?.entrada?.unidadeEntrada || 'mm',
    divisoes: parametros.N ?? parametros.divisoes ?? resultado?.entrada?.N ?? null,
    espessura: parametros.E ?? resultado?.entrada?.E ?? null,
    origem: 'tracagem',
  };
}

function salvar({ tipo, titulo, equipamento_id, os_id, usuario_id, parametros, resultado }) {
  const info = db.prepare(`
    INSERT INTO tracagens (
      tipo, modulo_origem, titulo, equipamento_id, os_id, usuario_id, criado_por, parametros_json, resultado_json, dados_calculo_json, updated_at
    ) VALUES (
      @tipo, @modulo_origem, @titulo, @equipamento_id, @os_id, @usuario_id, @criado_por, @parametros_json, @resultado_json, @dados_calculo_json, datetime('now')
    )
  `).run({
    tipo,
    modulo_origem: mapModuloOrigem(tipo),
    titulo: titulo || null,
    equipamento_id: equipamento_id || null,
    os_id: os_id || null,
    usuario_id: usuario_id || null,
    criado_por: usuario_id || null,
    parametros_json: JSON.stringify(parametros || {}),
    resultado_json: JSON.stringify(resultado || {}),
    dados_calculo_json: JSON.stringify(buildDadosCalculoJson(parametros, resultado)),
  });
  return Number(info.lastInsertRowid);
}

function salvarComPdf({ tipo, titulo, equipamento_id, os_id, usuario_id, parametros, resultado, pdf_filename, pdf_path }) {
  const info = db.prepare(`
    INSERT INTO tracagens (
      tipo, modulo_origem, titulo, equipamento_id, os_id, usuario_id, criado_por, parametros_json, resultado_json, dados_calculo_json,
      pdf_filename, pdf_path, pdf_generated_at, updated_at
    ) VALUES (
      @tipo, @modulo_origem, @titulo, @equipamento_id, @os_id, @usuario_id, @criado_por, @parametros_json, @resultado_json, @dados_calculo_json,
      @pdf_filename, @pdf_path, datetime('now'), datetime('now')
    )
  `).run({
    tipo,
    modulo_origem: mapModuloOrigem(tipo),
    titulo: titulo || null,
    equipamento_id: equipamento_id || null,
    os_id: os_id || null,
    usuario_id: usuario_id || null,
    criado_por: usuario_id || null,
    parametros_json: JSON.stringify(parametros || {}),
    resultado_json: JSON.stringify(resultado || {}),
    dados_calculo_json: JSON.stringify(buildDadosCalculoJson(parametros, resultado)),
    pdf_filename: pdf_filename || null,
    pdf_path: pdf_path || null,
  });

  return Number(info.lastInsertRowid);
}

function updatePdfInfo(id, { pdf_filename, pdf_path }) {
  db.prepare(`
    UPDATE tracagens
    SET pdf_filename = @pdf_filename,
        pdf_path = @pdf_path,
        pdf_generated_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: Number(id),
    pdf_filename: pdf_filename || null,
    pdf_path: pdf_path || null,
  });
}

function getById(id) {
  const row = db.prepare(`
    SELECT t.*, u.name AS usuario_nome, o.id AS os_codigo, e.nome AS equipamento_nome, e.codigo AS equipamento_codigo, e.setor AS equipamento_setor
    FROM tracagens t
    LEFT JOIN users u ON u.id = t.usuario_id
    LEFT JOIN os o ON o.id = t.os_id
    LEFT JOIN equipamentos e ON e.id = t.equipamento_id
    WHERE t.id = ?
  `).get(Number(id));
  if (!row) return null;
  return { ...row, parametros: JSON.parse(row.parametros_json || '{}'), resultado: JSON.parse(row.resultado_json || '{}') };
}

function list({ tipo, equipamento_id, os_id, periodo_inicio, periodo_fim } = {}) {
  const where = ['1=1'];
  const params = {};
  if (tipo) { where.push('t.tipo = @tipo'); params.tipo = tipo; }
  if (equipamento_id) { where.push('t.equipamento_id = @equipamento_id'); params.equipamento_id = Number(equipamento_id); }
  if (os_id) { where.push('t.os_id = @os_id'); params.os_id = Number(os_id); }
  if (periodo_inicio) { where.push("date(t.created_at) >= date(@periodo_inicio)"); params.periodo_inicio = periodo_inicio; }
  if (periodo_fim) { where.push("date(t.created_at) <= date(@periodo_fim)"); params.periodo_fim = periodo_fim; }

  return db.prepare(`
    SELECT t.id, t.tipo, t.titulo, t.created_at,
           e.nome AS equipamento_nome,
           o.id AS os_codigo,
           u.name AS usuario_nome
    FROM tracagens t
    LEFT JOIN equipamentos e ON e.id = t.equipamento_id
    LEFT JOIN os o ON o.id = t.os_id
    LEFT JOIN users u ON u.id = t.usuario_id
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(t.created_at) DESC
  `).all(params);
}

function listByOS(osId) {
  return db.prepare('SELECT id, tipo, titulo, created_at FROM tracagens WHERE os_id = ? ORDER BY datetime(created_at) DESC').all(Number(osId));
}

function listByEquipamento(equipamentoId) {
  return db.prepare(`
    SELECT id, tipo, titulo, created_at, pdf_filename, pdf_path
    FROM tracagens
    WHERE equipamento_id = ?
    ORDER BY datetime(created_at) DESC
  `).all(Number(equipamentoId));
}

function listEquipamentos() {
  return db.prepare(`
    SELECT id, nome, COALESCE(codigo, '') AS codigo, COALESCE(setor, '') AS setor, COALESCE(tipo, '') AS tipo
    FROM equipamentos
    ORDER BY nome ASC
  `).all();
}

function listEquipamentosParaVinculo(search = '') {
  const query = String(search || '').trim();
  const hasQuery = query.length > 0;
  return db.prepare(`
    SELECT id, nome, COALESCE(codigo, '') AS codigo, COALESCE(setor, '') AS setor, COALESCE(tipo, '') AS tipo
    FROM equipamentos
    ${hasQuery ? "WHERE lower(nome) LIKE @q OR lower(codigo) LIKE @q OR lower(setor) LIKE @q" : ''}
    ORDER BY nome ASC
    LIMIT 100
  `).all(hasQuery ? { q: `%${query.toLowerCase()}%` } : {});
}

function getEquipamentoById(id) {
  return db.prepare(`
    SELECT id, nome, COALESCE(codigo, '') AS codigo, COALESCE(setor, '') AS setor, COALESCE(tipo, '') AS tipo
    FROM equipamentos
    WHERE id = ?
  `).get(Number(id)) || null;
}

function listOSAbertas() {
  return db.prepare('SELECT id, status FROM os ORDER BY id DESC LIMIT 200').all();
}


function saveTracagem(payload) {
  return salvarComPdf(payload);
}

function vincularEquipamento({ tracagem_id, equipamento_id }) {
  db.prepare(`
    UPDATE tracagens
    SET equipamento_id = @equipamento_id,
        updated_at = datetime('now')
    WHERE id = @tracagem_id
  `).run({ tracagem_id: Number(tracagem_id), equipamento_id: Number(equipamento_id) });
}

function listarTracagensPorEquipamento(equipamentoId) {
  return listByEquipamento(equipamentoId);
}

module.exports = {
  TIPOS,
  n2,
  n4,
  assertFinite,
  normalizarMedida,
  normalizarEspessura,
  calcRoscaHelicoidal,
  calcFuracaoFlange,
  calcCilindro,
  calcCurvaGomos,
  calcQuadradoParaRedondo,
  calcReducaoConcentrica,
  calcSemiCilindro,
  calcBocaLoboExcentrica,
  calcBocaLobo45,
  calcBocaLobo90,
  calcMaoFrancesa,
  calcularPorTipo,
  salvar,
  salvarComPdf,
  saveTracagem,
  vincularEquipamento,
  listarTracagensPorEquipamento,
  updatePdfInfo,
  getById,
  list,
  listByOS,
  listByEquipamento,
  listEquipamentos,
  listEquipamentosParaVinculo,
  getEquipamentoById,
  listOSAbertas,
};
