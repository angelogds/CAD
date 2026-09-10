const fs = require('node:fs');
const path = require('node:path');
const service = require('./rh.service');
const people = require('./rh.people');
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

exports.index = (req, res, next) => {
  try {
    res.locals.activeMenu = 'rh';
    let dashboard = people.enrichDashboard(service.buildDashboard(currentUser(req)), currentUser(req));
    // DIRETORIA recebe indicadores e visão operacional agregada, mas não a lista
    // nominal de pendências pessoais/sensíveis. Detalhes continuam exclusivos a RH/ADMIN.
    if (!dashboard.canManage) dashboard = { ...dashboard, pendencias: [] };
    const requestedId = Number(req.query.colaborador || 0);
    const selected = requestedId && dashboard.canManage
      ? service.getCollaboratorDetail(requestedId, currentUser(req))
      : null;
    return res.render('rh/index', {
      title: 'RH • Gestão de Pessoas',
      dashboard,
      selected,
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
  return res.redirect(`/escala/rh?colaborador=${colaboradorId}#exames`);
};

exports.criarDocumento = (req, res) => {
  const colaboradorId = Number(req.params.id || 0);
  try {
    if (!req.file) throw new Error('Selecione um arquivo para upload.');
    colaboradoresService.criarDocumento(colaboradorId, {
      ...req.body,
      arquivo_url: `/uploads/colaboradores/documentos/${req.file.filename}`,
    }, currentUser(req));
    flash(req, 'success', 'Documento anexado à ficha do colaborador.');
  } catch (error) {
    flash(req, 'error', error.message || 'Não foi possível anexar o documento.');
  }
  return res.redirect(`/escala/rh?colaborador=${colaboradorId}#documentos`);
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
