const fs = require('fs');
const path = require('path');
const service = require('./tracagem.service');
const desenhoTecnicoService = require('../desenho-tecnico/desenho-tecnico.service');
const storagePaths = require('../../config/storage');


const PDF_STORAGE_DIR = path.join(storagePaths.PDF_DIR, 'tracagem');

function ensurePdfStorageDir() {
  if (!fs.existsSync(PDF_STORAGE_DIR)) fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'tracagem';
}

function buildStoredPdfFilename({ tipo, equipamento, createdAt }) {
  const date = new Date(createdAt || Date.now());
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const equipCode = slugify(equipamento?.codigo || equipamento?.nome || 'equipamento');
  return `tracagem-${slugify(tipo)}-${equipCode}-${y}-${m}-${d}.pdf`;
}

function getPdfDocumentClass() {
  try {
    // Lazy-load para não derrubar o módulo /tracagem inteiro caso falte dependência de PDF.
    // eslint-disable-next-line global-require
    return require('pdfkit');
  } catch (_err) {
    return null;
  }
}

const LABELS = {
  'rosca-helicoidal': 'Rosca helicoidal',
  'furacao-flange': 'Furação de flange',
  cilindro: 'Cilindro',
  'curva-gomos': 'Curva de gomos',
  'quadrado-para-redondo': 'Quadrado para redondo',
  'reducao-concentrica': 'Redução concêntrica',
  'semi-cilindro': 'Semi-cilindro',
  'boca-de-lobo-excentrica': 'Boca de lobo excêntrica',
  'boca-lobo-excentrica': 'Boca de lobo excêntrica',
  'boca-de-lobo-45': 'Boca de lobo (ângulo variável)',
  'boca-de-lobo-90': 'Boca de lobo 90 graus',
  'boca-lobo-45': 'Boca de lobo (ângulo variável)',
  'boca-lobo-90': 'Boca de lobo 90 graus',
  'boca-de-lobo-45-graus': 'Boca de lobo (ângulo variável)',
  'boca-de-lobo-90-graus': 'Boca de lobo 90 graus',
  'mao-francesa': 'Mão francesa',
  'pao-francesa': 'Mão francesa',
};

const PDF_STYLE = {
  green: '#1f9d55',
  light: '#f4fbf7',
  border: '#cde8d6',
  text: '#0f172a',
  muted: '#475569',
};

const IMAGE_ALIAS = {
  'boca-lobo-excentrica': 'boca-de-lobo-excentrica',
  'boca-lobo-45': 'boca-de-lobo-45',
  'boca-lobo-90': 'boca-de-lobo-90',
  'boca-de-lobo-45-graus': 'boca-de-lobo-45',
  'boca-de-lobo-90-graus': 'boca-de-lobo-90',
  'quadrado-redondo': 'quadrado-para-redondo',
  'pao-francesa': 'mao-francesa',
};

const IGNORE_PARAM_FIELDS = new Set(['unidade', 'unidadeEntrada', 'unidadeInterna']);

const PARAM_DESCRIPTIONS = {
  D: 'Diâmetro externo',
  d: 'Diâmetro interno / tubo base',
  P: 'Passo',
  E: 'Espessura da chapa',
  h: 'Altura útil',
  H: 'Altura útil',
  R: 'Raio de curvatura',
  A: 'Ângulo',
  G: 'Quantidade de gomos',
  N: 'Número de divisões',
  folgaSolda: 'Folga para solda',
  voltas: 'Quantidade de voltas',
  PCD: 'Diâmetro primitivo (PCD)',
  anguloInicial: 'Ângulo inicial',
  diametroFuro: 'Diâmetro do furo',
  D1: 'Diâmetro maior',
  D2: 'Diâmetro menor',
  C: 'Comprimento auxiliar',
  alpha: 'Ângulo de inclinação',
  AA: 'AA = lado A do quadrado',
  AB: 'AB = lado B do retângulo',
  A1: 'A1 = geratriz por divisão',
  A2: 'A2 = geratriz por divisão',
  A3: 'A3 = geratriz por divisão',
  A4: 'A4 = geratriz por divisão',
  C1: 'C1 = trecho entre divisões',
  C2: 'C2 = trecho entre divisões',
  C3: 'C3 = trecho entre divisões',
  C4: 'C4 = trecho entre divisões',
};

const PLAN_LEGENDS = {
  R1_dev: 'R1 = raio maior da planificação',
  R2_dev: 'R2 = raio menor da planificação',
  T: 'T = largura / altura útil',
  C: 'C = comprimento desenvolvido',
  C1: 'C1 = comprimento desenvolvido',
  angulo_dev: 'Ângulo = abertura da planificação',
  angulo_setor: 'Ângulo = abertura da planificação',
  A: 'A = comprimento desenvolvido',
  B: 'B = largura / altura útil',
  AA: 'AA = lado A do quadrado',
  AB: 'AB = lado B do retângulo',
  A1: 'A1 = geratriz de fabricação',
  A2: 'A2 = geratriz de fabricação',
  A3: 'A3 = geratriz de fabricação',
  A4: 'A4 = geratriz de fabricação',
  C2: 'C2 = trecho entre divisões',
  C3: 'C3 = trecho entre divisões',
  C4: 'C4 = trecho entre divisões',
};

function baseRender(req, res, view, payload = {}) {
  return res.render(view, {
    title: payload.title || 'Traçagem',
    activeMenu: 'tracagem',
    ...payload,
  });
}

function index(req, res) {
  return baseRender(req, res, 'tracagem/index', { title: 'Traçagem' });
}

function lista(req, res) {
  const filtros = {
    tipo: req.query.tipo || '',
    equipamento_id: req.query.equipamento_id || '',
    os_id: req.query.os_id || '',
    periodo_inicio: req.query.periodo_inicio || '',
    periodo_fim: req.query.periodo_fim || '',
  };

  const tracagens = service.list(filtros);
  return baseRender(req, res, 'tracagem/lista', {
    title: 'Histórico de traçagem',
    filtros,
    tracagens,
    equipamentos: service.listEquipamentos(),
    ordensServico: service.listOSAbertas(),
    labels: LABELS,
  });
}

function show(req, res) {
  const tracagem = service.getById(req.params.id);
  if (!tracagem) return res.status(404).render('errors/404', { title: 'Não encontrado' });

  const desenhoVinculado = desenhoTecnicoService.getByOrigem('TRACAGEM', `${tracagem.tipo}:${tracagem.id}`);
  return baseRender(req, res, 'tracagem/show', {
    title: `Traçagem #${tracagem.id}`,
    tracagem,
    labels: LABELS,
    desenhoVinculado,
  });
}

function renderCalc(tipo, viewName, title) {
  return (req, res) => baseRender(req, res, `tracagem/${viewName}`, {
    title,
    tipo,
    labels: LABELS,
    equipamentos: service.listEquipamentos(),
    ordensServico: service.listOSAbertas(),
    calculo: null,
  });
}

function calcular(tipo, viewName, title) {
  return (req, res) => {
    try {
      const resultado = service.calcularPorTipo(tipo, req.body);
      return baseRender(req, res, `tracagem/${viewName}`, {
        title,
        tipo,
        labels: LABELS,
        equipamentos: service.listEquipamentos(),
        ordensServico: service.listOSAbertas(),
        calculo: {
          parametros: req.body,
          resultado,
        },
      });
    } catch (err) {
      req.flash('error', err.message || 'Erro ao calcular traçagem.');
      return res.redirect(`/tracagem/${tipo}`);
    }
  };
}

function salvar(req, res) {
  try {
    const tipo = req.body.tipo;
    const parametros = JSON.parse(req.body.parametros_json || '{}');
    const resultado = JSON.parse(req.body.resultado_json || '{}');

    const id = service.salvar({
      tipo,
      titulo: req.body.titulo,
      equipamento_id: req.body.equipamento_id ? Number(req.body.equipamento_id) : null,
      os_id: req.body.os_id ? Number(req.body.os_id) : null,
      usuario_id: req.session?.user?.id || null,
      parametros,
      resultado,
    });

    req.flash('success', `Traçagem #${id} salva com sucesso.`);
    return res.redirect(`/tracagem/${id}`);
  } catch (err) {
    req.flash('error', err.message || 'Erro ao salvar traçagem.');
    return res.redirect('/tracagem');
  }
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR');
}

function resolveTipo(tipo) {
  return IMAGE_ALIAS[tipo] || tipo;
}

function resolveImagePath(tipo, sufixo) {
  const base = resolveTipo(tipo);
  const candidates = [
    path.join(process.cwd(), 'public', 'img', 'tracagem', 'planificacoes', `${base}-${sufixo}.png`),
    path.join(process.cwd(), 'public', 'img', 'tracagem', 'planificacoes', `${base}-${sufixo}.png.JPG`),
    path.join(process.cwd(), 'public', 'img', 'tracagem', 'planificacoes', `${base}-${sufixo}.JPG`),
    path.join(process.cwd(), 'public', 'img', 'tracagem', 'planificacoes', `${base}-${sufixo}.jpg`),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function drawSectionTitle(doc, title, y) {
  doc.fillColor(PDF_STYLE.green).fontSize(10).font('Helvetica-Bold').text(title.toUpperCase(), 36, y, {
    width: doc.page.width - 72,
    align: 'center',
  });
  doc.fillColor(PDF_STYLE.text).font('Helvetica');
}

function formatNumber(value) {
  return Number(value).toFixed(2);
}

function formatValue(value, unit = '', forceUnit = false) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${formatNumber(value)}${forceUnit || unit ? ` ${unit}` : ''}`.trim();
  }
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return `${formatNumber(Number(value))}${forceUnit || unit ? ` ${unit}` : ''}`.trim();
  }
  return String(value);
}

function buildFormattedData(tracagem) {
  const unidade = tracagem.parametros?.unidade || tracagem.resultado?.entrada?.unidadeEntrada || 'mm';
  const entrada = tracagem.resultado?.entrada || {};
  const resultado = tracagem.resultado?.resultado || {};
  const labels = tracagem.resultado?.planificacao?.labels || {};

  const identificacao = [
    { campo: 'Tipo', valor: LABELS[tracagem.tipo] || tracagem.tipo || '-' },
    { campo: 'Data', valor: formatDate(tracagem.created_at) },
    { campo: 'Usuário', valor: tracagem.usuario_nome || '-' },
    { campo: 'Unidade', valor: unidade },
    { campo: 'OS', valor: tracagem.os_id || '-' },
    { campo: 'Equipamento', valor: tracagem.equipamento_nome || '-' },
    { campo: 'Código equipamento', valor: tracagem.equipamento_codigo || '-' },
    { campo: 'Setor', valor: tracagem.equipamento_setor || '-' },
    { campo: 'Traçagem ID', valor: tracagem.id || '-' },
  ];

  const parametrosFormatados = Object.entries(entrada)
    .filter(([key, value]) => !IGNORE_PARAM_FIELDS.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => {
      const isNumeric = typeof value === 'number' || (typeof value === 'string' && !Number.isNaN(Number(value)));
      return {
        parametro: key,
        descricao: PARAM_DESCRIPTIONS[key] || key,
        valor: formatValue(value, isNumeric ? unidade : ''),
      };
    });

  const medidasPlanificacaoFormatadas = [];

  if (tracagem.tipo === 'curva-gomos') {
    const planificacao = tracagem.resultado?.planificacao || {};
    const divisoes = Array.isArray(planificacao.divisoes) ? planificacao.divisoes : [];
    const comprimentoTotal = planificacao.comprimentoTotal ?? resultado.comprimentoTotal ?? resultado.perimetro;
    const larguraDivisao = planificacao.larguraDivisao ?? resultado.larguraDivisao ?? resultado.passoDivisao;
    const numeroDivisoes = planificacao.numeroDivisoes ?? entrada.N ?? divisoes.length;

    medidasPlanificacaoFormatadas.push(
      {
        medida: 'P',
        legenda: 'Comprimento desenvolvido',
        valor: formatValue(comprimentoTotal, unidade),
        valorNumerico: Number(comprimentoTotal),
      },
      {
        medida: 'A',
        legenda: 'Largura entre divisões',
        valor: formatValue(larguraDivisao, unidade),
        valorNumerico: Number(larguraDivisao),
      },
      { medida: 'N', legenda: 'Número de divisões', valor: formatValue(numeroDivisoes) },
    );

    divisoes.forEach((item, idx) => {
      const indice = item.indice || idx + 1;
      const altura = item.altura ?? item.valor;
      if (!Number.isFinite(Number(altura))) return;
      medidasPlanificacaoFormatadas.push({
        medida: String(indice),
        legenda: `Medida da divisão ${indice}`,
        valor: formatValue(altura, unidade),
        valorNumerico: Number(altura),
      });
    });
  } else {
  const medidasMapeadas = new Map([
      ['R1', resultado.R1_dev ?? resultado.R1],
      ['R2', resultado.R2_dev ?? resultado.R2],
      ['T', resultado.T ?? resultado.B],
      ['C1', resultado.C1 ?? resultado.C ?? resultado.A],
      ['Ângulo', resultado.angulo_dev ?? resultado.angulo_setor],
      ['AA', resultado.AA],
      ['AB', resultado.AB],
      ['A1', resultado.A1],
      ['A2', resultado.A2],
      ['A3', resultado.A3],
      ['A4', resultado.A4],
      ['C', resultado.C],
      ['C2', resultado.C2],
      ['C3', resultado.C3],
      ['C4', resultado.C4],
    ]);

    medidasMapeadas.forEach((value, label) => {
      if (value === null || value === undefined || value === '') return;
      const key = label === 'Ângulo' ? 'angulo_dev' : label;
      medidasPlanificacaoFormatadas.push({
        medida: label,
        legenda: PLAN_LEGENDS[key] || label,
        valor: label === 'Ângulo' ? `${formatNumber(Number(value))}°` : formatValue(value, unidade),
      });
    });

    Object.entries(labels).forEach(([key, value]) => {
      if (['pontos', 'linhas', 'divisoes'].includes(key)) return;
      if (value === null || value === undefined || Number.isNaN(Number(value))) return;
      const medida = key.toUpperCase().includes('ANGULO') ? 'Ângulo' : key.replace('_dev', '').replace('_setor', '').toUpperCase();
      if (medidasPlanificacaoFormatadas.some((item) => item.medida === medida)) return;
      if (!['R1', 'R2', 'T', 'C', 'C1', 'C2', 'C3', 'C4', 'AA', 'AB', 'A1', 'A2', 'A3', 'A4', 'Ângulo'].includes(medida)) return;
      medidasPlanificacaoFormatadas.push({
        medida,
        legenda: PLAN_LEGENDS[key] || PLAN_LEGENDS[medida] || medida,
        valor: medida === 'Ângulo' ? `${formatNumber(Number(value))}°` : formatValue(value, unidade),
      });
    });
  }

  const observacoesFormatadas = Array.isArray(tracagem.resultado?.observacoes)
    ? tracagem.resultado.observacoes.filter((item) => item && String(item).trim() !== '').map((item) => String(item).trim())
    : [];

  if (!observacoesFormatadas.length) {
    observacoesFormatadas.push('Conferir folga, solda, sentido de montagem e espessura da chapa antes do corte final.');
  }

  return {
    identificacao,
    parametrosFormatados,
    medidasPlanificacaoFormatadas,
    observacoesFormatadas,
    imagemPeca: resolveImagePath(tracagem.tipo, 'peca'),
    imagemPlanificacao: resolveImagePath(tracagem.tipo, 'planificacao'),
    logoManutencao: path.join(process.cwd(), 'public', 'IMG', 'logo_menu.png.png'),
    unidade,
  };
}

function drawSimpleTable(doc, x, y, width, rows, headers, options = {}) {
  const rowHeight = options.rowHeight || 16;
  const headerHeight = options.headerHeight || rowHeight;
  const headerFontSize = options.headerFontSize || 8;
  const bodyFontSize = options.bodyFontSize || 8;
  const paddingX = options.paddingX || 4;
  const textOffsetY = options.textOffsetY || 4;
  const colWidths = headers.map((h) => h.width);

  doc.fillColor(PDF_STYLE.green).roundedRect(x, y, width, headerHeight, 4).fill();
  let currentX = x;
  headers.forEach((header, index) => {
    doc.fillColor('#ffffff').fontSize(headerFontSize).font('Helvetica-Bold').text(header.label, currentX, y + textOffsetY, {
      width: colWidths[index], align: 'center',
    });
    currentX += colWidths[index];
  });

  let currentY = y + headerHeight;
  rows.forEach((row, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : PDF_STYLE.light;
    doc.fillColor(bg).rect(x, currentY, width, rowHeight).fill();
    doc.strokeColor(PDF_STYLE.border).rect(x, currentY, width, rowHeight).stroke();

    currentX = x;
    headers.forEach((header, index) => {
      doc.fillColor(PDF_STYLE.text).fontSize(bodyFontSize).font('Helvetica').text(String(row[header.key] || '-'), currentX + paddingX, currentY + textOffsetY, { width: colWidths[index] - (paddingX * 2) });
      currentX += colWidths[index];
    });
    currentY += rowHeight;
  });

  return currentY;
}

function drawHeader(doc, tracagem, dados) {
  const width = doc.page.width - 72;
  doc.roundedRect(36, 26, width, 88, 10).fillAndStroke(PDF_STYLE.green, PDF_STYLE.green);

  if (dados.logoManutencao && fs.existsSync(dados.logoManutencao)) {
    doc.save();
    doc.roundedRect((doc.page.width / 2) - 22, 33, 44, 44, 8).clip();
    doc.image(dados.logoManutencao, (doc.page.width / 2) - 22, 33, { fit: [44, 44], align: 'center', valign: 'center' });
    doc.restore();
  }

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('MANUTENÇÃO CAMPO DO GADO', 36, 80, {
    width,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(9.5).text('RELATÓRIO TÉCNICO DE TRAÇAGEM', 36, 96, { width, align: 'center' });

  doc.fillColor(PDF_STYLE.text);
  doc.y = 120;
}

function drawIdentification(doc, dados) {
  drawSectionTitle(doc, 'Identificação', doc.y);
  const rows = dados.identificacao.map((item) => ({ campo: item.campo, valor: item.valor }));
  doc.y = drawSimpleTable(doc, 36, doc.y + 14, doc.page.width - 72, rows, [
    { label: 'Campo', key: 'campo', width: 160 },
    { label: 'Valor', key: 'valor', width: doc.page.width - 232 },
  ]) + 8;
}

function drawTwoColumnSection(doc, title, leftTitle, rightTitle, leftImage, rightRows, rightHeaders) {
  drawSectionTitle(doc, title, doc.y + 2);
  const startY = doc.y + 16;
  const leftX = 36;
  const rightX = 303;
  const colWidth = 273;
  const rows = rightRows.length ? rightRows : [{ [rightHeaders[0].key]: '-', [rightHeaders[1].key]: '-', [rightHeaders[2].key]: '-' }];
  const compactTable = rows.length > 8;
  const tableOptions = compactTable
    ? {
      rowHeight: 8,
      headerHeight: 9,
      headerFontSize: 6.2,
      bodyFontSize: 6.2,
      paddingX: 2,
      textOffsetY: 1.5,
    }
    : {};
  const tableHeaderHeight = tableOptions.headerHeight || 16;
  const tableRowHeight = tableOptions.rowHeight || 16;
  const blockHeight = Math.max(144, 28 + tableHeaderHeight + (rows.length * tableRowHeight));

  doc.fillColor('#ffffff').roundedRect(leftX, startY, colWidth, blockHeight, 8).fillAndStroke('#ffffff', PDF_STYLE.border);
  doc.fillColor(PDF_STYLE.green).fontSize(9).font('Helvetica-Bold').text(leftTitle, leftX, startY + 6, { width: colWidth, align: 'center' });
  if (leftImage && fs.existsSync(leftImage)) {
    doc.image(leftImage, leftX + 8, startY + 22, { fit: [colWidth - 16, blockHeight - 30], align: 'center', valign: 'center' });
  } else {
    doc.fillColor(PDF_STYLE.muted).fontSize(8).font('Helvetica').text('Imagem não disponível', leftX, startY + 64, { width: colWidth, align: 'center' });
  }

  doc.fillColor('#ffffff').roundedRect(rightX, startY, colWidth, blockHeight, 8).fillAndStroke('#ffffff', PDF_STYLE.border);
  doc.fillColor(PDF_STYLE.green).fontSize(9).font('Helvetica-Bold').text(rightTitle, rightX, startY + 6, { width: colWidth, align: 'center' });
  drawSimpleTable(
    doc,
    rightX + 6,
    startY + 21,
    colWidth - 12,
    rows,
    rightHeaders.map((header) => ({ ...header, width: Math.floor((colWidth - 12) * header.weight) })),
    tableOptions,
  );
  doc.y = startY + blockHeight + 8;

  doc.fillColor(PDF_STYLE.text);
  doc.font('Helvetica');
}

function drawObservacoes(doc, dados) {
  drawSectionTitle(doc, 'Observações técnicas', doc.y + 2);
  const itens = dados.observacoesFormatadas.slice(0, 3);
  let y = doc.y + 16;
  itens.forEach((obs) => {
    doc.fontSize(8.5).fillColor(PDF_STYLE.text).text(`• ${obs}`, 44, y, { width: doc.page.width - 88, lineGap: 1 });
    y += 13;
  });
  doc.y = y;
}

function drawFooter(doc) {
  const y = doc.page.height - 30;
  doc.fontSize(8).fillColor(PDF_STYLE.muted).text('Sistema de Manutenção Campo do Gado • Setor de Manutenção', 40, y, {
    width: doc.page.width - 80,
    align: 'center',
  });
}

function renderPdfReport(res, tracagem, filename, options = {}) {
  const PdfDocumentClass = getPdfDocumentClass();
  if (!PdfDocumentClass) {
    if (res) res.status(503).send('PDF temporariamente indisponível. Verifique a dependência pdfkit no servidor.');
    return null;
  }

  const dados = buildFormattedData(tracagem);
  const doc = new PdfDocumentClass({ margin: 24, size: 'A4' });

  if (options.outputPath) {
    ensurePdfStorageDir();
    doc.pipe(fs.createWriteStream(options.outputPath));
  }

  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
  }

  drawHeader(doc, tracagem, dados);
  drawIdentification(doc, dados);

  drawTwoColumnSection(
    doc,
    'Peça + parâmetros',
    'Imagem da peça',
    'Parâmetros informados',
    dados.imagemPeca,
    dados.parametrosFormatados.map((item) => ({ p: item.parametro, d: item.descricao, v: item.valor })),
    [
      { label: 'Parâmetro', key: 'p', weight: 0.25 },
      { label: 'Descrição', key: 'd', weight: 0.45 },
      { label: 'Valor', key: 'v', weight: 0.3 },
    ],
  );

  drawTwoColumnSection(
    doc,
    'Planificação + medidas',
    'Imagem da planificação',
    'Medidas da planificação',
    dados.imagemPlanificacao,
    dados.medidasPlanificacaoFormatadas.map((item) => {
      const valorEquipamento = item.valor;
      const valorPlanificacao = Number.isFinite(Number(item.valorNumerico))
        ? `${formatNumber(Number(item.valorNumerico) / 2)} ${dados.unidade}`
        : '-';
      return {
        m: item.medida,
        l: item.legenda,
        v: valorEquipamento,
        vp: valorPlanificacao,
      };
    }),
    tracagem.tipo === 'curva-gomos'
      ? [
        { label: 'Medida', key: 'm', weight: 0.16 },
        { label: 'Legenda', key: 'l', weight: 0.38 },
        { label: 'Equip.', key: 'v', weight: 0.23 },
        { label: 'Plan. (÷2)', key: 'vp', weight: 0.23 },
      ]
      : [
        { label: 'Medida', key: 'm', weight: 0.22 },
        { label: 'Legenda', key: 'l', weight: 0.48 },
        { label: 'Valor', key: 'v', weight: 0.3 },
      ],
  );

  drawObservacoes(doc, dados);
  drawFooter(doc);
  doc.end();
  return doc;
}

function gerarPdf(req, res) {
  const tracagem = service.getById(req.params.id);
  if (!tracagem) return res.status(404).render('errors/404', { title: 'Não encontrado' });

  const filename = `tracagem_${tracagem.tipo}_${tracagem.id}.pdf`;
  return renderPdfReport(res, tracagem, filename);
}

function gerarPdfCalculo(req, res) {
  try {
    const tipo = req.body.tipo;
    const parametros = JSON.parse(req.body.parametros_json || '{}');
    const resultado = JSON.parse(req.body.resultado_json || '{}');
    const tracagem = {
      id: 'calculo',
      tipo,
      titulo: req.body.titulo || `Cálculo de ${LABELS[tipo] || tipo || 'traçagem'}`,
      created_at: new Date().toISOString(),
      usuario_nome: req.session?.user?.name || req.session?.user?.username || '-',
      parametros,
      resultado,
      os_id: req.body.os_id || '-',
      equipamento_nome: req.body.equipamento_nome || '-',
      equipamento_codigo: req.body.equipamento_codigo || '-',
      equipamento_setor: req.body.equipamento_setor || '-',
    };

    const filename = `tracagem_${tracagem.tipo || 'calculo'}_${Date.now()}.pdf`;
    return renderPdfReport(res, tracagem, filename);
  } catch (err) {
    req.flash('error', err.message || 'Erro ao gerar PDF.');
    return res.redirect('back');
  }
}




function tracagensIndex(req, res) {
  return lista(req, res);
}

function tracagensVincular(req, res) {
  return relacionarEquipamento(req, res);
}

function tracagensPorEquipamento(req, res) {
  const tracagens = service.listarTracagensPorEquipamento(req.params.id);
  return res.json({ tracagens });
}

function tracagensPdf(req, res) {
  return baixarPdfVinculado(req, res);
}

function listarEquipamentosVinculo(req, res) {
  const search = req.query.search || '';
  const equipamentos = service.listEquipamentosParaVinculo(search);
  return res.json({ equipamentos });
}

function relacionarEquipamento(req, res) {
  try {
    const tipo = req.body.tipo;
    const equipamentoId = Number(req.body.equipamento_id || 0);
    if (!equipamentoId) {
      req.flash('error', 'Selecione um equipamento para relacionar a traçagem.');
      return res.redirect('back');
    }

    const equipamento = service.getEquipamentoById(equipamentoId);
    if (!equipamento) {
      req.flash('error', 'Equipamento não encontrado.');
      return res.redirect('back');
    }

    const parametros = JSON.parse(req.body.parametros_json || '{}');
    const resultado = JSON.parse(req.body.resultado_json || '{}');
    const titulo = req.body.titulo || `${LABELS[tipo] || 'Traçagem'} - ${equipamento.nome}`;

    const nowIso = new Date().toISOString();
    const filename = buildStoredPdfFilename({ tipo, equipamento, createdAt: nowIso });
    ensurePdfStorageDir();
    const storedPath = path.join(PDF_STORAGE_DIR, `${Date.now()}-${filename}`);

    const tracagemPdfContext = {
      id: 'vinculo',
      tipo,
      titulo,
      created_at: nowIso,
      usuario_nome: req.session?.user?.name || req.session?.user?.username || '-',
      parametros,
      resultado,
      os_id: req.body.os_id || '-',
      equipamento_nome: equipamento.nome,
      equipamento_codigo: equipamento.codigo || '-',
      equipamento_setor: equipamento.setor || '-',
    };

    renderPdfReport(null, tracagemPdfContext, filename, { outputPath: storedPath });

    const id = service.saveTracagem({
      tipo,
      titulo,
      equipamento_id: equipamentoId,
      os_id: req.body.os_id ? Number(req.body.os_id) : null,
      usuario_id: req.session?.user?.id || null,
      parametros,
      resultado,
      pdf_filename: filename,
      pdf_path: `/pdfs/tracagem/${path.basename(storedPath)}`,
    });

    req.flash('success', 'Traçagem vinculada ao equipamento com sucesso.');
    return res.redirect(`/equipamentos/${equipamentoId}?tab=tracagem`);
  } catch (err) {
    req.flash('error', err.message || 'Erro ao relacionar traçagem ao equipamento.');
    return res.redirect('back');
  }
}

function baixarPdfVinculado(req, res) {
  const tracagem = service.getById(req.params.id);
  if (!tracagem) return res.status(404).render('errors/404', { title: 'Não encontrado' });

  const fromPdfDir = tracagem.pdf_path ? path.join(storagePaths.PDF_DIR, tracagem.pdf_path.replace(/^\/pdfs\/?/, "")) : null;
  const fromUploadsDir = tracagem.pdf_path ? path.join(storagePaths.UPLOAD_DIR, tracagem.pdf_path.replace(/^\/uploads\/?/, "")) : null;
  const pdfPath = fromPdfDir && fs.existsSync(fromPdfDir) ? fromPdfDir : fromUploadsDir;

  if (pdfPath && fs.existsSync(pdfPath)) {
    const filename = tracagem.pdf_filename || path.basename(pdfPath);
    return res.download(pdfPath, filename);
  }

  const filename = tracagem.pdf_filename || `tracagem_${tracagem.tipo}_${tracagem.id}.pdf`;
  return renderPdfReport(res, tracagem, filename);
}

module.exports = {
  index,
  lista,
  show,
  roscaForm: renderCalc('rosca-helicoidal', 'rosca-helicoidal', 'Rosca helicoidal'),
  roscaCalcular: calcular('rosca-helicoidal', 'rosca-helicoidal', 'Rosca helicoidal'),
  flangeForm: renderCalc('furacao-flange', 'furacao-flange', 'Furação de flange'),
  flangeCalcular: calcular('furacao-flange', 'furacao-flange', 'Furação de flange'),
  cilindroForm: renderCalc('cilindro', 'cilindro', 'Cilindro'),
  cilindroCalcular: calcular('cilindro', 'cilindro', 'Cilindro'),
  curvaForm: renderCalc('curva-gomos', 'curva-gomos', 'Curva de gomos'),
  curvaCalcular: calcular('curva-gomos', 'curva-gomos', 'Curva de gomos'),
  quadradoRedondoForm: renderCalc('quadrado-para-redondo', 'quadrado-redondo', 'Quadrado para redondo'),
  quadradoRedondoCalcular: calcular('quadrado-para-redondo', 'quadrado-redondo', 'Quadrado para redondo'),
  reducaoConcentricaForm: renderCalc('reducao-concentrica', 'reducao-concentrica', 'Redução concêntrica'),
  reducaoConcentricaCalcular: calcular('reducao-concentrica', 'reducao-concentrica', 'Redução concêntrica'),
  semiCilindroForm: renderCalc('semi-cilindro', 'semi-cilindro', 'Semi-cilíndro'),
  semiCilindroCalcular: calcular('semi-cilindro', 'semi-cilindro', 'Semi-cilíndro'),
  bocaLoboExcentricaForm: renderCalc('boca-de-lobo-excentrica', 'boca-lobo-excentrica', 'Boca de lobo excêntrica'),
  bocaLoboExcentricaCalcular: calcular('boca-de-lobo-excentrica', 'boca-lobo-excentrica', 'Boca de lobo excêntrica'),
  bocaLobo45Form: renderCalc('boca-de-lobo-45', 'boca-lobo-45', 'Boca de lobo (ângulo variável)'),
  bocaLobo45Calcular: calcular('boca-de-lobo-45', 'boca-lobo-45', 'Boca de lobo (ângulo variável)'),
  bocaLobo90Form: renderCalc('boca-de-lobo-90', 'boca-lobo-90', 'Boca de lobo 90 graus'),
  bocaLobo90Calcular: calcular('boca-de-lobo-90', 'boca-lobo-90', 'Boca de lobo 90 graus'),
  maoFrancesaForm: renderCalc('mao-francesa', 'mao-francesa', 'Mão francesa'),
  maoFrancesaCalcular: calcular('mao-francesa', 'mao-francesa', 'Mão francesa'),
  salvar,
  gerarPdf,
  gerarPdfCalculo,
  listarEquipamentosVinculo,
  relacionarEquipamento,
  baixarPdfVinculado,
  tracagensIndex,
  tracagensVincular,
  tracagensPorEquipamento,
  tracagensPdf,
};
