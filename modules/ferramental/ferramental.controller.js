const service = require('./ferramental.service');
const pdfService = require('./ferramental.pdf');

function pcmBase(res) {
  res.locals.activeMenu = 'pcm';
  res.locals.activePcmSection = 'ferramental';
}

function index(req, res) {
  pcmBase(res);
  try {
    return res.render('ferramental/index', {
      title: 'PCM - Gestão de Ferramental',
      ferramental: service.dashboard(),
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
    return res.render('meu-portal/ferramental', {
      title: 'Meu Ferramental',
      ferramental: service.listOwnTools(req.session.user.id),
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

module.exports = {
  index,
  createTeam,
  createLocker,
  createTool,
  assignTool,
  teamPdf,
  ownTools,
  ownPdf,
};
