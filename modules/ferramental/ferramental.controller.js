const service = require('./ferramental.service');
const pdfService = require('./ferramental.pdf');
const aceiteService = require('./ferramental.aceite.service');
const evidence = require('./ferramental.evidence');
const inventarioService = require('./ferramental.inventario.service');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const ocorrenciaService = require('./ferramental.ocorrencia.service');
const inspecaoService = require('./ferramental.inspecao.service');

function pcmBase(res) {
  res.locals.activeMenu = 'pcm';
  res.locals.activePcmSection = 'ferramental';
}

function index(req, res) {
  pcmBase(res);
  try {
    const ferramental = service.dashboard();
    ferramental.aceites = aceiteService.dashboard();
    ferramental.inventarios = inventarioService.listDashboard();
    ferramental.ocorrencias = ocorrenciaService.dashboard();
    ferramental.inspecoes = inspecaoService.dashboard();
    return res.render('ferramental/index', {
      title: 'PCM - Gestão de Ferramental',
      ferramental,
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar a Gestão de Ferramental.');
    return res.redirect('/pcm');
  }
}

function createTeam(req, res) {
  try {
    service.createTeam({
      nome: req.body.nome,
      user_ids: [req.body.responsavel_1, req.body.responsavel_2],
    }, req.session.user.id);
    req.flash('success', 'Grupo de responsabilidade criado com sucesso.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível criar o grupo de responsabilidade.');
  }
  return res.redirect('/pcm/ferramental#responsaveis');
}

function createLocker(req, res) {
  try {
    service.createLocker(req.body, req.session.user.id);
    req.flash('success', 'Armário cadastrado com oito compartimentos.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível cadastrar o armário.');
  }
  return res.redirect('/pcm/ferramental#armarios');
}

function createTool(req, res) {
  try {
    service.createTool(req.body, req.session.user.id);
    req.flash('success', 'Ferramenta cadastrada com sucesso.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível cadastrar a ferramenta.');
  }
  return res.redirect('/pcm/ferramental#ferramentas');
}

function assignTool(req, res) {
  try {
    service.assignTool(req.body, req.session.user.id);
    req.flash('success', 'Responsabilidade e local de guarda atualizados.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível atribuir a ferramenta.');
  }
  return res.redirect('/pcm/ferramental#custodia');
}

function pipePdf(res, doc, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);
}

function teamPdf(req, res, next) {
  try {
    const doc = pdfService.generateTeamPdf(Number(req.params.equipeId));
    pipePdf(res, doc, `ficha-ferramental-equipe-${Number(req.params.equipeId)}.pdf`);
  } catch (error) {
    next(error);
  }
}

function ownTools(req, res) {
  res.locals.activeMenu = 'meu-portal';
  try {
    const ferramental = service.listOwnTools(req.session.user.id);
    ferramental.aceites = aceiteService.listOwnAcceptances(req.session.user.id);
    ferramental.inventarios = inventarioService.listOwn(req.session.user.id);
    ferramental.ocorrencias = ocorrenciaService.listOwn(req.session.user.id);
    ferramental.inspecoes = inspecaoService.ownStatus(req.session.user.id);
    return res.render('meu-portal/ferramental', {
      title: 'Meu Ferramental',
      ferramental,
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar seu ferramental.');
    return res.redirect('/meu-portal');
  }
}

function ownPdf(req, res, next) {
  try {
    const doc = pdfService.generateUserPdf(req.session.user.id);
    pipePdf(res, doc, 'meu-ferramental.pdf');
  } catch (error) {
    next(error);
  }
}


function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim()
    .slice(0, 120);
}

function acceptOwnTool(req, res) {
  let signaturePath = null;
  const selfiePath = req.file?.path || null;
  try {
    if (!selfiePath) throw new Error('Tire ou selecione uma selfie para confirmar o recebimento.');
    signaturePath = evidence.saveSignatureDataUrl(req.body.assinatura_data, {
      userId: req.session.user.id,
      custodiaId: req.params.custodiaId,
    });
    aceiteService.confirmAcceptance(req.session.user.id, req.params.custodiaId, {
      selfie_path: selfiePath,
      assinatura_path: signaturePath,
      observacao: req.body.observacao,
      termo_aceito: req.body.termo_aceito === '1',
      ip_origem: clientIp(req),
      user_agent: req.get('user-agent'),
    });
    req.flash('success', 'Recebimento confirmado. A evidência foi vinculada à ficha do ferramental.');
  } catch (error) {
    evidence.removeFile(signaturePath);
    evidence.removeFile(selfiePath);
    req.flash('error', error.message || 'Não foi possível confirmar o recebimento.');
  }
  return res.redirect('/meu-portal/ferramental');
}

function rejectOwnTool(req, res) {
  try {
    aceiteService.rejectAcceptance(
      req.session.user.id,
      req.params.custodiaId,
      req.body.motivo,
      { ip_origem: clientIp(req), user_agent: req.get('user-agent') }
    );
    req.flash('success', 'Divergência registrada. O PCM poderá revisar a entrega.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a divergência.');
  }
  return res.redirect('/meu-portal/ferramental');
}

function sendEvidence(res, filePath) {
  const target = evidence.resolveEvidencePath(filePath);
  if (!target) return res.status(404).send('Evidência não encontrada.');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.sendFile(target);
}

function ownEvidence(req, res) {
  const row = aceiteService.getAcceptanceById(req.params.aceiteId);
  if (!row || Number(row.user_id) !== Number(req.session.user.id)) {
    return res.status(404).send('Evidência não encontrada.');
  }
  const tipo = String(req.params.tipo || '').toLowerCase();
  const filePath = tipo === 'assinatura' ? row.assinatura_path : tipo === 'selfie' ? row.selfie_path : null;
  if (!filePath) return res.status(404).send('Evidência não encontrada.');
  return sendEvidence(res, filePath);
}

function pcmEvidence(req, res) {
  const row = aceiteService.getAcceptanceById(req.params.aceiteId);
  if (!row) return res.status(404).send('Evidência não encontrada.');
  const tipo = String(req.params.tipo || '').toLowerCase();
  const filePath = tipo === 'assinatura' ? row.assinatura_path : tipo === 'selfie' ? row.selfie_path : null;
  if (!filePath) return res.status(404).send('Evidência não encontrada.');
  return sendEvidence(res, filePath);
}


function createInventory(req, res) {
  try {
    inventarioService.createInventory(req.body, req.session.user.id);
    req.flash('success', 'Conferência periódica criada e distribuída aos responsáveis.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível criar a conferência.');
  }
  return res.redirect('/pcm/ferramental#conferencias');
}

function submitInventoryItem(req, res) {
  try {
    inventarioService.submitItem(req.session.user.id, req.params.itemId, req.body);
    req.flash('success', 'Conferência registrada com sucesso.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a conferência.');
  }
  return res.redirect('/meu-portal/ferramental#conferencias');
}

function resolveDivergence(req, res) {
  try {
    aceiteService.resolveDivergence(req.params.aceiteId, req.session.user.id, req.body.observacao);
    req.flash('success', 'Divergência tratada. O aceite foi reaberto para nova confirmação do responsável.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível tratar a divergência.');
  }
  return res.redirect('/pcm/ferramental#aceites');
}

function requestBaseUrl(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwarded || req.protocol || 'https';
  return `${protocol}://${req.get('host')}`;
}

function qrLookup(req, res) {
  try {
    const ferramenta = service.getToolByQrToken(req.params.token);
    if (!ferramenta) return res.status(404).send('Ferramenta não encontrada.');
    const historico = ocorrenciaService.history(ferramenta.id);
    const inspecao = inspecaoService.toolInspectionStatus(ferramenta.id);
    return res.render('ferramental/qr', {
      title: `Ferramental - ${ferramenta.codigo_interno}`,
      ferramenta,
      historico,
      inspecao,
    });
  } catch (error) {
    return res.status(500).send(error.message || 'Não foi possível consultar a ferramenta.');
  }
}

async function toolLabelPdf(req, res, next) {
  try {
    const ferramenta = service.getToolById(req.params.ferramentaId);
    if (!ferramenta?.qr_token) return res.status(404).send('Ferramenta não encontrada ou sem QR Code.');

    const url = `${requestBaseUrl(req)}/ferramental/qr/${encodeURIComponent(ferramenta.qr_token)}`;
    const qr = await QRCode.toBuffer(url, { type: 'png', width: 420, margin: 1, errorCorrectionLevel: 'M' });
    const doc = new PDFDocument({ size: [300, 190], margin: 12, info: { Title: `Etiqueta ${ferramenta.codigo_interno}` } });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="etiqueta-${ferramenta.codigo_interno}.pdf"`);
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(8).text('CAMPO DO GADO • MANUTENÇÃO', 145, 14, { width: 140 });
    doc.fontSize(17).text(ferramenta.codigo_interno, 145, 32, { width: 140 });
    doc.font('Helvetica-Bold').fontSize(10).text(ferramenta.descricao, 145, 58, { width: 140, height: 34 });
    doc.font('Helvetica').fontSize(7.5)
      .text(`Série: ${ferramenta.numero_serie || '-'}`, 145, 100, { width: 140 })
      .text(`Patrimônio: ${ferramenta.patrimonio || '-'}`, 145, 113, { width: 140 })
      .text(`Condição: ${String(ferramenta.condicao || '-').replaceAll('_', ' ')}`, 145, 126, { width: 140 })
      .text('Escaneie o QR para consultar a custódia atual.', 145, 146, { width: 140 });
    doc.image(qr, 12, 12, { fit: [122, 122] });
    doc.font('Helvetica-Bold').fontSize(7).text('IDENTIFICAÇÃO INTERNA', 12, 141, { width: 122, align: 'center' });
    doc.rect(4, 4, 292, 182).lineWidth(0.7).stroke('#777777');
    doc.end();
  } catch (error) {
    return next(error);
  }
}

async function qrImage(req, res, next) {
  try {
    const ferramenta = service.getToolById(req.params.ferramentaId);
    if (!ferramenta?.qr_token) return res.status(404).send('QR Code não disponível.');
    const url = `${requestBaseUrl(req)}/ferramental/qr/${encodeURIComponent(ferramenta.qr_token)}`;
    const buffer = await QRCode.toBuffer(url, { type: 'png', width: 360, margin: 2, errorCorrectionLevel: 'M' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(buffer);
  } catch (error) {
    return next(error);
  }
}


function createOwnOccurrence(req, res) {
  try {
    ocorrenciaService.createOwnOccurrence(
      req.session.user.id,
      req.params.ferramentaId,
      req.body
    );
    req.flash('success', 'Ocorrência registrada. O PCM foi acionado para tratamento.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a ocorrência.');
  }
  return res.redirect('/meu-portal/ferramental#ocorrencias');
}

function createPcmOccurrence(req, res) {
  try {
    ocorrenciaService.createPcmOccurrence(
      req.session.user.id,
      req.params.ferramentaId,
      req.body
    );
    req.flash('success', 'Ocorrência aberta pelo PCM.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível abrir a ocorrência.');
  }
  return res.redirect('/pcm/ferramental#ocorrencias');
}

function resolveOccurrence(req, res) {
  try {
    ocorrenciaService.resolveOccurrence(
      req.params.ocorrenciaId,
      req.session.user.id,
      req.body
    );
    req.flash('success', 'Ocorrência tratada e movimentação registrada no histórico.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível tratar a ocorrência.');
  }
  return res.redirect('/pcm/ferramental#ocorrencias');
}

function toolHistory(req, res) {
  pcmBase(res);
  try {
    const ferramenta = service.getToolById(req.params.ferramentaId);
    if (!ferramenta) return res.status(404).send('Ferramenta não encontrada.');
    const historico = ocorrenciaService.history(ferramenta.id);
    const inspecao = inspecaoService.toolInspectionStatus(ferramenta.id);
    return res.render('ferramental/historico', {
      title: `Histórico - ${ferramenta.codigo_interno}`,
      ferramenta,
      historico,
      inspecao,
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar o histórico.');
    return res.redirect('/pcm/ferramental');
  }
}


function configureInspection(req, res) {
  try {
    inspecaoService.configure(req.params.ferramentaId || req.body.ferramenta_id, req.body, req.session.user.id);
    req.flash('success', 'Plano de inspeção atualizado. A próxima inspeção foi agendada.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível configurar a inspeção.');
  }
  return res.redirect('/pcm/ferramental#inspecoes');
}

function scheduleInspection(req, res) {
  try {
    inspecaoService.scheduleInspection(req.params.ferramentaId || req.body.ferramenta_id, req.body, req.session.user.id);
    req.flash('success', 'Inspeção extraordinária agendada.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível agendar a inspeção.');
  }
  return res.redirect('/pcm/ferramental#inspecoes');
}

function inspectionForm(req, res) {
  pcmBase(res);
  try {
    const detalhe = inspecaoService.inspectionDetail(req.params.inspecaoId);
    if (!detalhe) return res.status(404).send('Inspeção não encontrada.');
    return res.render('ferramental/inspecao', {
      title: `Inspeção - ${detalhe.inspection.codigo}`,
      detalhe,
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar a inspeção.');
    return res.redirect('/pcm/ferramental#inspecoes');
  }
}

function executeInspection(req, res) {
  try {
    inspecaoService.executeInspection(req.params.inspecaoId, req.body, req.session.user.id);
    req.flash('success', 'Inspeção concluída e situação de uso atualizada.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível concluir a inspeção.');
    return res.redirect(`/pcm/ferramental/inspecoes/${Number(req.params.inspecaoId) || ''}`);
  }
  return res.redirect('/pcm/ferramental#inspecoes');
}

module.exports = {
  index,
  createTeam,
  createLocker,
  createTool,
  assignTool,
  teamPdf,
  ownTools,
  ownPdf,
  acceptOwnTool,
  rejectOwnTool,
  ownEvidence,
  pcmEvidence,
  createInventory,
  submitInventoryItem,
  resolveDivergence,
  qrLookup,
  qrImage,
  toolLabelPdf,
  createOwnOccurrence,
  createPcmOccurrence,
  resolveOccurrence,
  toolHistory,
  configureInspection,
  scheduleInspection,
  inspectionForm,
  executeInspection,
};
