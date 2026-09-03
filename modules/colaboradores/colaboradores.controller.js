const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const service = require('./colaboradores.service');
const perms = require('./colaboradores.permissions');
const escalaService = require('../escala/escala.service');

function actor(req) {
  return {
    id: Number(req.session?.user?.id || req.user?.id || 0) || null,
    name: req.session?.user?.name || req.user?.name || null,
    role: req.session?.user?.role || req.user?.role || null,
  };
}

function parseId(param) {
  const id = Number(param);
  return Number.isFinite(id) ? id : 0;
}

function ensureCanAccess(req, res, colaborador) {
  if (!colaborador) {
    res.status(404).render('errors/404', { title: 'Colaborador não encontrado', layout: 'layout' });
    return false;
  }
  if (!perms.canAccessColaborador(req, colaborador)) {
    res.status(403).render('errors/403', { title: 'Sem permissão', layout: 'layout' });
    return false;
  }
  return true;
}

function maskColaboradorContact(colaborador, canViewContactDetails) {
  if (canViewContactDetails) return colaborador;
  return {
    ...colaborador,
    telefone: null,
    telefone_whatsapp: null,
    contato_emergencia: null,
  };
}

function maskEmergencyDetails(colaborador, canViewEmergencyDetails) {
  if (canViewEmergencyDetails) return colaborador;
  return {
    ...colaborador,
    tipo_sanguineo: null,
    contato_emergencia: null,
  };
}

function safeScale(call, fallback) {
  try {
    return call();
  } catch (error) {
    console.warn('[colaboradores] Falha ao compor dados da Escala:', error?.message || error);
    return fallback;
  }
}

function index(req, res) {
  const role = perms.roleOf(req);
  const canViewContactDetails = perms.canViewContactDetails(req);
  const filtros = {
    search: req.query.search || '',
    setor: req.query.setor || '',
    status: req.query.status || '',
  };

  let lista = service.listColaboradores(filtros);
  if (role === 'COLABORADOR') {
    const uid = Number(req.session?.user?.id || req.user?.id || 0);
    lista = lista.filter((c) => Number(c.user_id || 0) === uid);
  }

  const painelEscala = safeScale(
    () => escalaService.listarPainelEscala({ user: actor(req), canViewAll: role !== 'COLABORADOR' }),
    { pendentes: 0, colaboradores: [] }
  );
  const operationalById = new Map((painelEscala.colaboradores || []).map((item) => [Number(item.id), item]));

  lista = lista.map((c) => ({
    ...maskColaboradorContact(c, canViewContactDetails),
    operacional: operationalById.get(Number(c.id)) || null,
  }));

  const indicadores = {
    total: lista.length,
    ativos: lista.filter((c) => String(c.status || '').toUpperCase() === 'ATIVO').length,
    inativos: lista.filter((c) => String(c.status || '').toUpperCase() !== 'ATIVO').length,
    emEscala: lista.filter((c) => c.operacional).length,
    indisponiveis: lista.filter((c) => /(folga|férias|ferias|atestado|ausente|falta)/i.test(String(c.operacional?.statusAtual || ''))).length,
    horasExtrasMesMinutos: lista.reduce((total, c) => total + Number(c.operacional?.horasExtrasMesMinutos || 0), 0),
    bancoHorasMinutos: lista.reduce((total, c) => total + Number(c.operacional?.saldo?.minutos || 0), 0),
    pendentes: Number(painelEscala.pendentes || 0),
  };

  const setores = [...new Set(lista.map((c) => String(c.setor || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return res.render('colaboradores/index', {
    title: 'Colaboradores',
    lista,
    filtros,
    indicadores,
    setores,
    role,
    canManageProfiles: perms.canManageProfiles(req),
    canViewContactDetails,
  });
}

function show(req, res) {
  const id = parseId(req.params.id);
  let colaborador = service.getColaboradorById(id);
  if (!ensureCanAccess(req, res, colaborador)) return;

  const canViewContactDetails = perms.canViewContactDetails(req);
  const canViewEmergencyDetails = perms.canViewEmergencyDetails(req);
  colaborador = maskColaboradorContact(colaborador, canViewContactDetails);
  colaborador = maskEmergencyDetails(colaborador, canViewEmergencyDetails);

  const tabs = service.getTabData(id);
  const dashboard = service.getDashboard(id);
  const historico = service.getTimeline(id);
  const activeTab = String(req.query.tab || 'resumo');

  const painelEscala = safeScale(
    () => escalaService.listarPainelEscala({ user: actor(req), canViewAll: false, colaboradorId: id }),
    { pendentes: 0, colaboradores: [] }
  );
  const operational = (painelEscala.colaboradores || [])[0] || null;
  const horasExtras = safeScale(() => escalaService.listarHorasExtras({ colaborador_id: id }).slice(0, 40), []);
  const bancoHoras = safeScale(() => escalaService.calcularSaldoBancoHoras(id), { minutos: 0, horas: '0h00', creditos: 0, debitos: 0, diasFolga: 0 });
  const bancoMovimentos = safeScale(() => escalaService.listarMovimentosBancoHoras(id).slice(0, 40), []);
  const folgas = safeScale(() => escalaService.listarFolgas({ colaborador_id: id }).slice(0, 40), []);

  return res.render('colaboradores/show', {
    title: `Colaborador • ${colaborador.nome}`,
    colaborador,
    dashboard,
    tabs,
    historico,
    operational,
    horasExtras,
    bancoHoras,
    bancoMovimentos,
    folgas,
    activeTab,
    role: perms.roleOf(req),
    canManageProfiles: perms.canManageProfiles(req),
    canViewContactDetails,
    canViewEmergencyDetails,
    canManageFerramental: perms.canManageFerramental(req),
    canManageEPIAndMateriais: perms.canManageEPIAndMateriais(req),
    canValidateCertificados: perms.canValidateCertificados(req),
    canGenerateReports: perms.canGenerateReports(req),
    isColaboradorOnly: perms.isColaboradorOnly(req),
    today: new Date().toISOString().slice(0, 10),
  });
}

function savePerfil(req, res) {
  if (!perms.canManageProfiles(req)) {
    req.flash('error', 'Sem permissão para editar perfil.');
    return res.redirect(`/colaboradores/${req.params.id}`);
  }

  const id = parseId(req.params.id);
  const payload = { ...req.body, id };
  if (!perms.canViewContactDetails(req)) {
    const atual = service.getColaboradorById(id) || {};
    payload.telefone = atual.telefone || null;
    payload.telefone_whatsapp = atual.telefone_whatsapp || null;
    payload.contato_emergencia = atual.contato_emergencia || null;
  }
  const foto = req.file ? `/imagens/colaboradores/fotos/${req.file.filename}` : null;
  if (foto) payload.foto_url = foto;

  service.createOrUpdateColaborador(payload, actor(req));
  service.upsertDetalhes(id, req.body, actor(req));

  req.flash('success', 'Perfil do colaborador atualizado.');
  return res.redirect(`/colaboradores/${id}?tab=dados`);
}

function create(req, res) {
  if (!perms.canManageProfiles(req)) {
    req.flash('error', 'Sem permissão para cadastrar colaborador.');
    return res.redirect('/colaboradores');
  }

  const foto = req.file ? `/imagens/colaboradores/fotos/${req.file.filename}` : null;
  const id = service.createOrUpdateColaborador({ ...req.body, foto_url: foto }, actor(req));
  service.upsertDetalhes(id, req.body, actor(req));

  req.flash('success', 'Colaborador cadastrado com sucesso.');
  return res.redirect(`/colaboradores/${id}`);
}

function lancarFerramental(req, res) {
  if (!perms.canManageFerramental(req)) {
    req.flash('error', 'Sem permissão para lançar ferramental.');
    return res.redirect(`/colaboradores/${req.params.id}?tab=ferramental`);
  }

  service.lancarFerramental(parseId(req.params.id), req.body, actor(req));
  req.flash('success', 'Movimentação de ferramenta registrada.');
  return res.redirect(`/colaboradores/${req.params.id}?tab=ferramental`);
}

function atualizarFerramental(req, res) {
  if (!perms.canManageFerramental(req)) {
    req.flash('error', 'Sem permissão para atualizar ferramental.');
    return res.redirect(`/colaboradores/${req.params.id}?tab=ferramental`);
  }

  const acao = String(req.body.acao || '').trim().toLowerCase();
  const statusByAcao = {
    transferir: 'transferido',
    devolver: 'devolvido',
    extravio: 'extraviado',
  };

  service.changeRegistroStatus('movimentacoes_ferramentas', parseId(req.params.movId), statusByAcao[acao] || 'ativo', actor(req), parseId(req.params.id));
  req.flash('success', `Ferramental atualizado (${acao || 'status'}).`);
  return res.redirect(`/colaboradores/${req.params.id}?tab=ferramental`);
}

function lancarEpi(req, res) {
  if (!perms.canManageEPIAndMateriais(req)) {
    req.flash('error', 'Sem permissão para lançar EPI.');
    return res.redirect(`/colaboradores/${req.params.id}?tab=epis`);
  }

  service.lancarEpi(parseId(req.params.id), req.body, actor(req));
  req.flash('success', 'Entrega de EPI registrada.');
  return res.redirect(`/colaboradores/${req.params.id}?tab=epis`);
}

function atualizarEpi(req, res) {
  if (!perms.canManageEPIAndMateriais(req)) {
    req.flash('error', 'Sem permissão para atualizar EPI.');
    return res.redirect(`/colaboradores/${req.params.id}?tab=epis`);
  }

  const acao = String(req.body.acao || '').trim().toLowerCase();
  const statusByAcao = {
    troca: 'trocado',
    devolucao: 'devolvido',
    vencer: 'vencido',
    ativo: 'ativo',
  };

  service.changeRegistroStatus('entregas_epi', parseId(req.params.entregaId), statusByAcao[acao] || 'ativo', actor(req), parseId(req.params.id));
  req.flash('success', `Status do EPI atualizado (${acao || 'ativo'}).`);
  return res.redirect(`/colaboradores/${req.params.id}?tab=epis`);
}

function lancarMateriais(req, res) {
  if (!perms.canManageEPIAndMateriais(req)) {
    req.flash('error', 'Sem permissão para retirada de materiais.');
    return res.redirect(`/colaboradores/${req.params.id}?tab=materiais`);
  }

  try {
    service.lancarRetiradaMaterial(parseId(req.params.id), req.body, actor(req));
    req.flash('success', 'Retirada de material registrada com rastreabilidade.');
  } catch (err) {
    req.flash('error', err.message || 'Não foi possível registrar a retirada.');
  }
  return res.redirect(`/colaboradores/${req.params.id}?tab=materiais`);
}

function criarCertificado(req, res) {
  const id = parseId(req.params.id);
  const arquivo_url = req.file ? `/uploads/colaboradores/documentos/${req.file.filename}` : null;

  service.criarCertificado(id, { ...req.body, arquivo_url }, actor(req));
  req.flash('success', 'Certificado registrado.');
  return res.redirect(`/colaboradores/${id}?tab=${req.body.tipo === 'externo' ? 'certificados-externos' : 'cursos-internos'}`);
}

function validarCertificado(req, res) {
  if (!perms.canValidateCertificados(req)) {
    req.flash('error', 'Apenas RH/Admin pode validar certificados.');
    return res.redirect(`/colaboradores/${req.params.id}?tab=certificados-externos`);
  }

  service.validarCertificado(parseId(req.params.id), parseId(req.params.certificadoId), req.body.status_validacao || 'aprovado', actor(req));
  req.flash('success', 'Status de validação atualizado.');
  return res.redirect(`/colaboradores/${req.params.id}?tab=certificados-externos`);
}

function uploadDocumento(req, res) {
  if (!req.file) {
    req.flash('error', 'Selecione um arquivo para upload.');
    return res.redirect(`/colaboradores/${req.params.id}?tab=documentos`);
  }

  service.criarDocumento(parseId(req.params.id), {
    ...req.body,
    arquivo_url: `/uploads/colaboradores/documentos/${req.file.filename}`,
  }, actor(req));

  req.flash('success', 'Documento/termo anexado.');
  return res.redirect(`/colaboradores/${req.params.id}?tab=documentos`);
}

function confirmarCiencia(req, res) {
  const id = parseId(req.params.id);
  let colaborador = service.getColaboradorById(id);
  if (!ensureCanAccess(req, res, colaborador)) return;
  const canViewContactDetails = perms.canViewContactDetails(req);
  colaborador = maskColaboradorContact(colaborador, canViewContactDetails);

  try {
    service.confirmarCiencia(id, req.body.entidade, parseId(req.body.entidade_id), actor(req));
    req.flash('success', 'Confirmação digital registrada com data, hora e usuário.');
  } catch (err) {
    req.flash('error', err.message || 'Não foi possível confirmar ciência.');
  }

  return res.redirect(`/colaboradores/${id}?tab=${req.body.tab || 'historico'}`);
}

function relatorio(req, res) {
  if (!perms.canGenerateReports(req)) {
    req.flash('error', 'Sem permissão para gerar relatórios.');
    return res.redirect(`/colaboradores/${req.params.id}`);
  }

  const id = parseId(req.params.id);
  const tipo = String(req.params.tipo || 'individual').trim().toLowerCase();
  const data = service.getReportData(id);
  const canViewContactDetails = perms.canViewContactDetails(req);
  if (data?.colaborador) data.colaborador = maskColaboradorContact(data.colaborador, canViewContactDetails);

  if (!data.colaborador) return res.status(404).render('errors/404', { title: 'Colaborador não encontrado', layout: 'layout' });

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="colaborador-${id}-${tipo}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(`Relatório de Colaborador - ${data.colaborador.nome}`);
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#4b5563').text(`Tipo: ${tipo} | Gerado em: ${new Date().toLocaleString('pt-BR')}`);
  doc.moveDown();

  doc.fillColor('#111827').fontSize(12).text('Resumo');
  doc.fontSize(10)
    .text(`Função: ${data.colaborador.funcao || '-'}`)
    .text(`Setor: ${data.colaborador.setor || '-'}`)
    .text(`Status: ${data.colaborador.status || '-'}`)
    .text(`EPIs ativos: ${data.dashboard.episAtivos}`)
    .text(`Ferramentas ativas: ${data.dashboard.ferramentasAtivas}`)
    .text(`Materiais (mês): ${data.dashboard.materiaisMes}`)
    .text(`Pendências: ${data.dashboard.pendencias}`)
    .text(`Custo ferramental ativo: R$ ${Number(data.custoFerramental || 0).toFixed(2)}`);

  const sections = {
    individual: ['ferramental', 'epis', 'materiais', 'cursosInternos', 'certificadosExternos'],
    ferramentas: ['ferramental'],
    epis: ['epis'],
    materiais: ['materiais'],
    custos: ['ferramental', 'materiais'],
  };

  for (const key of sections[tipo] || sections.individual) {
    doc.addPage().fontSize(13).text(`Seção: ${key}`);
    const rows = data.tabs[key] || [];
    if (!rows.length) {
      doc.moveDown().fontSize(10).text('Sem registros.');
      continue;
    }
    rows.slice(0, 80).forEach((row, idx) => {
      doc.moveDown(0.4).fontSize(9).text(`${idx + 1}. ${JSON.stringify(row)}`);
    });
  }

  doc.end();
}

function installationGuide(req, res) {
  return res.render('colaboradores/install', {
    title: 'Instalação do Módulo de Colaboradores',
  });
}

module.exports = {
  index,
  show,
  savePerfil,
  create,
  lancarFerramental,
  atualizarFerramental,
  lancarEpi,
  atualizarEpi,
  lancarMateriais,
  criarCertificado,
  validarCertificado,
  uploadDocumento,
  confirmarCiencia,
  relatorio,
  installationGuide,
};
