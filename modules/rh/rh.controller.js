const fs = require('node:fs');
const path = require('node:path');
const service = require('./rh.service');
const people = require('./rh.people');
const rhDocuments = require('./rh.documents');
const colaboradoresService = require('../colaboradores/colaboradores.service');
const dateBr = require('../../utils/data-hora-br');

function currentUser(req) { return req.user || req.session?.user || {}; }
function flash(req, type, message) { req.flash?.(type, message); }

function formatMinutes(value) {
  const raw = Number(value || 0);
  const sign = raw < 0 ? '-' : '';
  const total = Math.abs(Math.round(raw));
  return `${sign}${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
}

function loadDashboard(req) {
  let dashboard = people.enrichDashboard(service.buildDashboard(currentUser(req)), currentUser(req));
  // DIRETORIA recebe indicadores e visão operacional agregada, mas não a lista
  // nominal de pendências pessoais/sensíveis. Detalhes continuam exclusivos a RH/ADMIN.
  if (!dashboard.canManage) dashboard = { ...dashboard, pendencias: [] };
  return dashboard;
}

function loadSelected(req, colaboradorId) {
  const id = Number(colaboradorId || 0);
  if (!id) return null;
  let selected = service.getCollaboratorDetail(id, currentUser(req));
  if (selected?.colaborador?.id) {
    selected = {
      ...selected,
      documentos: rhDocuments.listForCollaborator(selected.colaborador.id, { self: false }),
    };
  }
  return selected;
}

function renderArea(req, res, next, view, title, extra = {}) {
  try {
    res.locals.activeMenu = 'rh';
    const dashboard = loadDashboard(req);
    return res.render(view, {
      title,
      dashboard,
      dateBr,
      formatMinutes,
      ...extra,
    });
  } catch (error) { return next(error); }
}

exports.index = (req, res, next) => renderArea(
  req,
  res,
  next,
  'rh/index',
  'RH • Gestão de Pessoas',
  { activeRhSection: 'dashboard' }
);

exports.colaboradores = (req, res, next) => renderArea(
  req,
  res,
  next,
  'rh/colaboradores',
  'RH • Colaboradores',
  { activeRhSection: 'colaboradores' }
);

exports.jornada = (req, res, next) => renderArea(
  req,
  res,
  next,
  'rh/jornada',
  'RH • Jornada e Banco de Horas',
  { activeRhSection: 'jornada' }
);

exports.colaborador = (req, res, next) => {
  try {
    const dashboard = loadDashboard(req);
    const selected = loadSelected(req, req.params.id);
    if (!selected?.colaborador) return res.status(404).send('Colaborador não encontrado.');
    res.locals.activeMenu = 'rh';
    return res.render('rh/colaborador', {
      title: `RH • ${selected.colaborador.nome || 'Colaborador'}`,
      dashboard,
      selected,
      activeRhSection: 'colaboradores',
      dateBr,
      formatMinutes,
    });
  } catch (error) { return next(error); }
};

exports.folgas = (req, res, next) => renderArea(
  req,
  res,
  next,
  'rh/folgas',
  'RH • Folgas e Solicitações',
  { activeRhSection: 'folgas' }
);

exports.exames = (req, res, next) => {
  try {
    const dashboard = loadDashboard(req);
    const selected = loadSelected(req, req.query.colaborador);
    res.locals.activeMenu = 'rh';
    return res.render('rh/exames', {
      title: 'RH • Exames Ocupacionais',
      dashboard,
      selected,
      activeRhSection: 'exames',
      dateBr,
      formatMinutes,
    });
  } catch (error) { return next(error); }
};

exports.documentos = (req, res, next) => {
  try {
    const dashboard = loadDashboard(req);
    const selected = loadSelected(req, req.query.colaborador);
    res.locals.activeMenu = 'rh';
    return res.render('rh/documentos', {
      title: 'RH • Documentos',
      dashboard,
      selected,
      activeRhSection: 'documentos',
      dateBr,
      formatMinutes,
    });
  } catch (error) { return next(error); }
};

exports.treinamentos = (req, res, next) => {
  try {
    const dashboard = loadDashboard(req);
    const selected = loadSelected(req, req.query.colaborador);
    res.locals.activeMenu = 'rh';
    return res.render('rh/treinamentos', {
      title: 'RH • Treinamentos e Certificados',
      dashboard,
      selected,
      activeRhSection: 'treinamentos',
      dateBr,
      formatMinutes,
    });
  } catch (error) { return next(error); }
};

exports.criarExame = (req, res) => {
  const colaboradorId = Number(req.params.id || 0);
  try {
    service.createExam(colaboradorId, req.body, req.file, currentUser(req));
    flash(req, 'success', 'Exame ocupacional registrado com sucesso.');
  } catch (error) {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_unlinkError) {}
    }
    flash(req, 'error', error.message || 'Não foi possível registrar o exame.');
  }
  return res.redirect(`/rh/exames?colaborador=${colaboradorId}`);
};

exports.criarDocumento = (req, res) => {
  const colaboradorId = Number(req.params.id || 0);
  try {
    if (!req.file) throw new Error('Selecione um arquivo para upload.');
    colaboradoresService.criarDocumento(colaboradorId, {
      ...req.body,
      arquivo_url: rhDocuments.privateMarker(req.file.filename),
    }, currentUser(req));
    flash(req, 'success', 'Documento anexado à ficha do colaborador.');
  } catch (error) {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_unlinkError) {}
    }
    flash(req, 'error', error.message || 'Não foi possível anexar o documento.');
  }
  return res.redirect(`/rh/documentos?colaborador=${colaboradorId}`);
};

exports.exameArquivo = (req, res, next) => {
  try {
    const exame = service.getExamForDownload(Number(req.params.exameId), Number(req.params.id));
    if (!exame || !fs.existsSync(exame.filePath)) return res.status(404).send('Arquivo de exame não encontrado.');
    const downloadName = String(exame.arquivo_nome_original || path.basename(exame.filePath));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.download(exame.filePath, downloadName);
  } catch (error) { return next(error); }
};

exports.documentoArquivo = (req, res, next) => {
  try {
    const documento = rhDocuments.getPrivateDocumentForDownload(Number(req.params.documentoId), Number(req.params.id));
    if (!documento || !fs.existsSync(documento.filePath)) return res.status(404).send('Documento não encontrado.');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.download(documento.filePath, path.basename(documento.filePath));
  } catch (error) { return next(error); }
};
