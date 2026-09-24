function n2(v) { return Number(Number(v).toFixed(2)); }

function getUnidade(params = {}) {
  return params.unidade === 'cm' ? 'cm' : 'mm';
}

function medida(valor, unidade, nome) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${nome} deve ser maior que zero.`);
  return unidade === 'cm' ? n * 10 : n;
}

function inteiro(valor, nome, padrao, min) {
  const n = Number.parseInt((valor === '' || valor === null || valor === undefined) ? padrao : valor, 10);
  if (!Number.isFinite(n) || n < min) throw new Error(`${nome} deve ser inteiro maior ou igual a ${min}.`);
  return n;
}

function calcExaustorRadial(params = {}) {
  const unidade = getUnidade(params);
  const D = medida(params.D ?? params.diametroExterno ?? params.diametroRotor, unidade, 'Diâmetro externo do rotor');
  const dInterno = medida(
    params.dInterno ?? params.d ?? params.dCubo ?? params.diametroInterno ?? params.diametroCubo,
    unidade,
    'Diâmetro interno do rotor',
  );
  const N = inteiro(params.N ?? params.palhetas, 'Quantidade de palhetas', 12, 3);

  if (dInterno >= D) {
    throw new Error('O diâmetro interno deve ser menor que o diâmetro externo do rotor.');
  }

  // Mesma base geométrica usada na Furação de Flange:
  // divisão angular uniforme e corda entre pontos consecutivos.
  const raioExterno = D / 2;
  const raioInterno = dInterno / 2;
  const passoAngular = 360 / N;
  const cordaExterna = 2 * raioExterno * Math.sin(Math.PI / N);
  const cordaInterna = 2 * raioInterno * Math.sin(Math.PI / N);
  const passoArcoExterno = (Math.PI * D) / N;
  const passoArcoInterno = (Math.PI * dInterno) / N;
  const comprimentoRadialPalheta = raioExterno - raioInterno;

  const palhetas = Array.from({ length: N }, (_, idx) => {
    const angulo = idx * passoAngular;
    const rad = (angulo * Math.PI) / 180;
    return {
      indice: idx + 1,
      angulo: n2(angulo),
      xInterno: n2(raioInterno * Math.cos(rad)),
      yInterno: n2(raioInterno * Math.sin(rad)),
      xExterno: n2(raioExterno * Math.cos(rad)),
      yExterno: n2(raioExterno * Math.sin(rad)),
    };
  });

  return {
    entrada: {
      D: n2(D),
      dInterno: n2(dInterno),
      dCubo: n2(dInterno), // compatibilidade com registros gerados na primeira versão
      N,
      unidadeEntrada: unidade,
      unidadeInterna: 'mm',
      anguloPalheta: 90,
    },
    resultado: {
      raioExterno: n2(raioExterno),
      raioInterno: n2(raioInterno),
      raioRotor: n2(raioExterno), // compatibilidade
      raioCubo: n2(raioInterno), // compatibilidade
      passoAngular: n2(passoAngular),
      distanciaEntrePalhetas: n2(cordaExterna),
      cordaExterna: n2(cordaExterna),
      cordaInterna: n2(cordaInterna),
      passoArcoExterno: n2(passoArcoExterno),
      passoArcoInterno: n2(passoArcoInterno),
      comprimentoRadialPalheta: n2(comprimentoRadialPalheta),
      alturaRadialPalheta: n2(comprimentoRadialPalheta), // compatibilidade
      palhetas,
    },
    planificacao: {
      labels: {
        D: n2(D),
        dInterno: n2(dInterno),
        N,
        passoAngular: n2(passoAngular),
        cordaExterna: n2(cordaExterna),
        cordaInterna: n2(cordaInterna),
        comprimentoRadialPalheta: n2(comprimentoRadialPalheta),
      },
      pontos: palhetas.map((p) => ({ nome: `P${p.indice}`, x: p.xExterno, y: p.yExterno })),
      linhas: palhetas.map((p) => ({
        nome: `P${p.indice}`,
        x1: p.xInterno,
        y1: p.yInterno,
        x2: p.xExterno,
        y2: p.yExterno,
      })),
      divisoes: palhetas.map((p) => ({
        indice: p.indice,
        angulo: p.angulo,
        distanciaExterna: n2(cordaExterna),
        distanciaInterna: n2(cordaInterna),
      })),
      palhetas,
    },
    observacoes: [
      'A divisão usa a mesma lógica geométrica da furação de flange: 360° dividido pela quantidade de palhetas e cálculo da corda entre marcações.',
      'Para traçar na chapa, marque os pontos consecutivos no diâmetro externo usando a corda externa e, no diâmetro interno, usando a corda interna.',
      'Ligue cada ponto externo ao ponto interno de mesmo índice para obter as linhas radiais das palhetas a 90°.',
      'O passo em arco é informado como referência; para marcação reta com compasso/trena entre pontos, utilize a medida da corda.',
      'Após fabricação, conferir dimensões, soldagem e balanceamento do rotor antes da operação.',
    ],
  };
}

module.exports = { calcExaustorRadial };
