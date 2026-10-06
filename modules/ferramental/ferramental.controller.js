const service = require('./ferramental.service');
const pdfService = require('./ferramental.pdf');
const aceiteService = require('./ferramental.aceite.service');
const evidence = require('./ferramental.evidence');

function pcmBase(res) {
  res.locals.activeMenu = 'pcm';
  res.locals.activePcmSection = 'ferramental';
}

function index(req, res) {
  pcmBase(res);
  try {
    const ferramental = service.dashboard();
    ferramental.aceites = aceiteService.dashboard();
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
};
