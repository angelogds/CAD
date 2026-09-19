const fs = require('node:fs');
const path = require('node:path');
const service = require('./rh.service');
const people = require('./rh.people');
const rhDocuments = require('./rh.documents');
const atestados = require('./rh.atestados');
const rhNotifications = require('./rh.notifications');
const rhPdf = require('./rh.pdf');
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
  // nominal de pendências pessoais/sensíveis. Detalhes continuam exclusivos ao RH.
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

exports.colaborador = (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(404).send('Colaborador não encontrado.');
  return res.redirect(302, `/colaboradores/${id}`);
};

exports.folgas = (req, res, next) => renderArea(
  req,
  res,
  next,
  'rh/folgas',
  'RH • Folgas e Solicitações',
  { activeRhSection: 'folgas' }
);

exports.atestados = (req, res, next) => {
  try {
    const dashboard = loadDashboard(req);
    const registros = atestados.listAll({
      status: req.query.status,
      colaborador_id: req.query.colaborador_id,
      inicio: req.query.inicio,
      fim: req.query.fim,
      limit: 500,
    });
    res.locals.activeMenu = 'rh';
    return res.render('rh/atestados', {
      title: 'RH • Atestados',
      dashboard,
      registros,
      filtros: req.query || {},
      activeRhSection: 'atestados',
      dateBr,
      formatMinutes,
    });
  } catch (error) { return next(error); }
};

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

exports.atestadoArquivo = (req, res, next) => {
  try {
    const item = atestados.getPrivateFile(Number(req.params.id));
    if (!item) return res.status(404).send('Atestado não encontrado.');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.download(item.filePath, item.arquivo_nome_original || path.basename(item.filePath));
  } catch (error) { return next(error); }
};

exports.atestadoStatus = (req, res) => {
  try {
    const item = atestados.updateStatus(Number(req.params.id), req.body.status, currentUser(req));
    rhNotifications.notifyAtestadoStatus(item.id);
    flash(req, 'success', item.status === 'ARQUIVADO' ? 'Atestado arquivado.' : 'Recebimento do atestado confirmado.');
  } catch (error) {
    flash(req, 'error', error.message || 'Não foi possível atualizar o atestado.');
  }
  return res.redirect('/rh/atestados');
};

exports.folgaPdf = (req, res) => {
  try {
    const id = Number(req.params.id);
    const doc = rhPdf.generateLeavePdf({ requestId: id });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=folga_${id}.pdf`);
    res.setHeader('Cache-Control', 'private, no-store');
    doc.pipe(res);
    return undefined;
  } catch (error) {
    flash(req, 'error', error.message || 'Não foi possível gerar o PDF da folga.');
    return res.redirect('/rh/folgas');
  }
};

exports.folgasPdf = (req, res) => {
  try {
    const doc = rhPdf.generateConsolidatedLeavePdf({
      inicio: req.query.inicio,
      fim: req.query.fim,
      status: req.query.status || 'APROVADA',
      colaborador_id: req.query.colaborador_id,
    });
    const inicio = String(req.query.inicio || 'todos').replace(/[^0-9a-z_-]/gi, '_');
    const fim = String(req.query.fim || 'todos').replace(/[^0-9a-z_-]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=folgas_rh_${inicio}_${fim}.pdf`);
    res.setHeader('Cache-Control', 'private, no-store');
    doc.pipe(res);
    return undefined;
  } catch (error) {
    flash(req, 'error', error.message || 'Não foi possível gerar o PDF consolidado.');
    return res.redirect('/rh/folgas');
  }
};
