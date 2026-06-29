const service = require("./escala.service");
const generator = require("./escala.pdf");
let preventivasService = null;
try {
  preventivasService = require("../preventivas/preventivas.service");
} catch (_e) {
  preventivasService = null;
}

function normalizeTipoAusencia(tipo) {
  const raw = String(tipo || "").trim().toUpperCase();
  if (raw === "FOLGA_MEIO_PERIODO") return "FOLGA_MEIO_PERIODO";
  if (raw === "FOLGA") return "FOLGA";
  if (raw === "ATESTADO") return "ATESTADO";
  if (raw === "FERIAS") return "FERIAS";
  return "";
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function daysInclusive(start, end) {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return Math.floor((e - s) / 86400000) + 1;
}


function getCurrentMonthRangeISO() {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    start: first.toISOString().slice(0, 10),
    end: last.toISOString().slice(0, 10),
  };
}

function isValidDateISO(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}


function userRole(req) { return String(currentUser(req).role || '').toUpperCase(); }
function canManageEscala(req) { return ['ADMIN','ENCARREGADO_MANUTENCAO','MANUTENCAO_SUPERVISOR','SUPERVISOR_MANUTENCAO'].includes(userRole(req)); }
function canViewAllEscala(req) { return canManageEscala(req) || ['RH','DIRETORIA'].includes(userRole(req)); }
function visibleColaboradorId(req) { return service.buscarColaboradorDoUsuario(currentUser(req).id)?.id || null; }

function reprocessarPreventivasComNovaEscala() {
  if (typeof preventivasService?.reprocessarPreventivasComNovaEscala === "function") {
    preventivasService.reprocessarPreventivasComNovaEscala();
  }
}

exports.index = (req, res, next) => {
  try {
    res.locals.activeMenu = "escala";
    const painel = service.listarPainelEscala({ user: currentUser(req), canViewAll: canViewAllEscala(req), colaboradorId: visibleColaboradorId(req) });
    return res.render("escala/index", { title: "Escala", painel, canManageEscala: canManageEscala(req), canViewAllEscala: canViewAllEscala(req) });
  } catch (e) {
    next(e);
  }
};

exports.semana = (req, res, next) => {
  try {
    res.locals.activeMenu = "escala";

    const date = String(req.query?.date || "").slice(0, 10);
    const alvo = date || isoToday();

    const semana = service.getSemanaPorData(alvo);
    const publicacoes = service.getPublicacoes();
    const monthRange = getCurrentMonthRangeISO();
    const pdfStart = String(req.query?.start || monthRange.start).slice(0, 10);
    const pdfEnd = String(req.query?.end || monthRange.end).slice(0, 10);

    return res.render("escala/semana", {
      title: "Escala da Semana",
      alvo,
      semana,
      publicacoes,
      pdfStart,
      pdfEnd,
      canManageEscala: canManageEscala(req),
    });
  } catch (e) {
    next(e);
  }
};

exports.completa = (req, res, next) => {
  try {
    res.locals.activeMenu = "escala";
    const semanas = service.getEscalaCompletaComTimes();
    return res.render("escala/completa", { title: "Escala Completa", semanas, canManageEscala: canManageEscala(req), colaboradores: service.listarColaboradoresManutencao(), quantidadeSemanal: Number(req.query.quantidade || 3) });
  } catch (e) {
    next(e);
  }
};

exports.ausencias = (req, res, next) => {
  try {
    res.locals.activeMenu = "escala";
    const date = String(req.query?.date || "").slice(0, 10);
    const alvo = date || isoToday();
    const ausencias = service.listarAusencias({ dateISO: alvo });

    return res.render("escala/ausencias", {
      title: "Colaboradores em Folga/Atestado",
      alvo,
      ausencias,
    });
  } catch (e) {
    next(e);
  }
};

exports.adicionarRapido = (req, res, next) => {
  try {
    const inicio = String(req.body?.inicio || "").slice(0, 10);
    const fim = String(req.body?.fim || "").slice(0, 10);
    const nome = String(req.body?.nome || "").trim();
    const turno = service.normalizeTurno(req.body?.turno);
    const funcao = service.normalizeFuncao(req.body?.funcao);
    const dateRef = inicio || String(req.body?.date || "").slice(0, 10) || isoToday();

    if (!inicio || !fim) {
      req.flash("error", "Preencha início e fim do período.");
      return res.redirect(`/escala/semana?date=${dateRef}`);
    }
    if (fim < inicio) {
      req.flash("error", "Data final não pode ser menor que data inicial.");
      return res.redirect(`/escala/semana?date=${inicio}`);
    }
    if (!nome) {
      req.flash("error", "Informe o nome do colaborador.");
      return res.redirect(`/escala/semana?date=${inicio}`);
    }
    if (!turno) {
      req.flash("error", "Turno inválido. Use Dia, Noite ou Plantão.");
      return res.redirect(`/escala/semana?date=${inicio}`);
    }
    if (!funcao) {
      req.flash("error", "Função inválida. Use Mecânico Industrial.");
      return res.redirect(`/escala/semana?date=${inicio}`);
    }

    const resultado = service.adicionarRapidoPeriodo({
      inicio,
      fim,
      nome,
      tipo_turno: turno,
      funcao,
    });
    reprocessarPreventivasComNovaEscala();

    let msg = `Período salvo com sucesso (${resultado.semanasAfetadas} semana(s): ${resultado.inserted} inserção(ões), ${resultado.updated} atualização(ões), ${resultado.ignored} sem alterações).`;
    if (resultado.diasSemSemana > 0) {
      msg += ` ${resultado.diasSemSemana} dia(s) do período não possuem semana cadastrada e foram ignorados.`;
    }

    req.flash("success", msg);
    return res.redirect(`/escala/semana?date=${inicio}`);
  } catch (e) {
    next(e);
  }
};

exports.lancarAusencia = (req, res, next) => {
  try {
    const date = String(req.body?.date || "").slice(0, 10) || isoToday();
    const nome = String(req.body?.nome || "").trim();
    const tipo = normalizeTipoAusencia(req.body?.tipo);
    const inicio = String(req.body?.inicio || "").slice(0, 10);
    const fim = String(req.body?.fim || "").slice(0, 10);
    const motivo = String(req.body?.motivo || "").trim();
    const dataServico = String(req.body?.dataServico || "").slice(0, 10);
    const horaInicio = String(req.body?.horaInicio || "").trim();
    const horaFim = String(req.body?.horaFim || "").trim();
    const equipamento = String(req.body?.equipamento || "").trim();
    const descricaoServico = String(req.body?.descricaoServico || "").trim();
    const funcao = service.normalizeFuncao(req.body?.funcao) || "mecanico";

    if (!nome || !inicio || !fim || !tipo) {
      req.flash("error", "Preencha: Colaborador, Tipo, Início e Fim.");
      return res.redirect(`/escala/semana?date=${date}`);
    }

    if (inicio > fim) {
      req.flash("error", "Data início não pode ser maior que data fim.");
      return res.redirect(`/escala/semana?date=${date}`);
    }

    if (!["FOLGA", "FOLGA_MEIO_PERIODO", "ATESTADO", "FERIAS"].includes(tipo)) {
      req.flash("error", "Tipo inválido (use Folga, Folga meio período, Férias ou Atestado).");
      return res.redirect(`/escala/semana?date=${date}`);
    }

    if (tipo === "ATESTADO" && !motivo) {
      req.flash("error", "Motivo é obrigatório para atestado.");
      return res.redirect(`/escala/semana?date=${date}`);
    }

    if (tipo === "FOLGA") {
      const hasAnyCompField = dataServico || horaInicio || horaFim || equipamento || descricaoServico;
      if (hasAnyCompField && (!dataServico || !horaInicio || !horaFim || !equipamento || !descricaoServico)) {
        req.flash("error", "Para folga por compensação, preencha todos os campos do serviço prestado.");
        return res.redirect(`/escala/semana?date=${date}`);
      }
    }

    service.lancarAusencia({
      nome,
      tipo,
      inicio,
      fim,
      motivo,
      dataServico,
      horaInicio,
      horaFim,
      equipamento,
      descricaoServico,
      funcao,
    });
    reprocessarPreventivasComNovaEscala();

    req.flash("success", "Concessão lançada com sucesso.");
    return res.redirect(`/escala/semana?date=${date}`);
  } catch (e) {
    next(e);
  }
};

exports.atualizarAusencia = (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const date = String(req.body?.date || req.query?.date || "").slice(0, 10) || isoToday();
    const tipo = normalizeTipoAusencia(req.body?.tipo);
    const inicio = String(req.body?.inicio || "").slice(0, 10);
    const fim = String(req.body?.fim || "").slice(0, 10);
    const motivo = String(req.body?.motivo || "").trim();

    service.atualizarAusencia({ id, tipo, inicio, fim, motivo });
    reprocessarPreventivasComNovaEscala();

    req.flash("success", "Ausência atualizada com sucesso.");
    return res.redirect(`/escala/ausencias?date=${date}`);
  } catch (e) {
    next(e);
  }
};

exports.removerAusencia = (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const date = String(req.body?.date || req.query?.date || "").slice(0, 10) || isoToday();

    if (!id) {
      req.flash("error", "Registro inválido para exclusão.");
      return res.redirect(`/escala/ausencias?date=${date}`);
    }

    const ok = service.removerAusencia(id);
    if (!ok) {
      req.flash("error", "Registro não encontrado para exclusão.");
      return res.redirect(`/escala/ausencias?date=${date}`);
    }
    reprocessarPreventivasComNovaEscala();

    req.flash("success", "Ausência apagada com sucesso.");
    return res.redirect(`/escala/ausencias?date=${date}`);
  } catch (e) {
    next(e);
  }
};



exports.removerAlocacao = (req, res, next) => {
  try {
    const alocacaoId = Number(req.params.id);
    const date = String(req.body?.date || req.query?.date || "").slice(0, 10) || isoToday();

    if (!alocacaoId) {
      req.flash("error", "Alocação inválida para exclusão.");
      return res.redirect(`/escala/semana?date=${date}`);
    }

    const ok = service.removerAlocacao(alocacaoId);
    if (!ok) {
      req.flash("error", "Registro não encontrado para exclusão.");
      return res.redirect(`/escala/semana?date=${date}`);
    }
    reprocessarPreventivasComNovaEscala();

    req.flash("success", "Registro removido com sucesso.");
    return res.redirect(`/escala/semana?date=${date}`);
  } catch (e) {
    next(e);
  }
};

exports.editarSemana = (req, res, next) => {
  try {
    res.locals.activeMenu = "escala";
    const semanaId = Number(req.params.id);
    const semana = service.getSemanaById(semanaId);
    if (!semana) return res.status(404).send("Semana não encontrada");

    return res.render("escala/editar", { title: "Editar Semana", semana });
  } catch (e) {
    next(e);
  }
};

exports.salvarEdicao = (req, res, next) => {
  try {
    const semanaId = Number(req.params.id);
    const alocacaoId = Number(req.body?.alocacaoId);
    const novoTurno = String(req.body?.novoTurno || "").trim().toLowerCase();

    const tipo_turno =
      novoTurno === "noturno" || novoTurno === "noite" ? "noturno" :
      novoTurno === "diurno" || novoTurno === "dia" ? "diurno" :
      novoTurno === "folga" ? "folga" :
      novoTurno === "plantao" ? "plantao" :
      "";

    if (!alocacaoId || !tipo_turno) {
      req.flash("error", "Dados inválidos para edição.");
      return res.redirect(`/escala/editar/${semanaId}`);
    }

    service.atualizarTurno(alocacaoId, tipo_turno);
    reprocessarPreventivasComNovaEscala();

    req.flash("success", "Turno atualizado.");
    return res.redirect(`/escala/editar/${semanaId}`);
  } catch (e) {
    next(e);
  }
};

exports.pdfSemana = (req, res, next) => {
  try {
    const rows = service.getEscalaSemanalPdfData().map((s) => ({
      semanaNumero: String(s.semana),
      periodoTexto: `${generator.formatDateBr(s.data_inicio)} até ${generator.formatDateBr(s.data_fim)}`,
      noturno: s.noturno,
      diurno: s.diurno,
      observacoes: "Todos como Mecânico Industrial",
    }));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="escala-semanal.pdf"');
    const doc = generator.generateWeeklyPDF({ rows });
    doc.pipe(res);
    return doc;
  } catch (e) {
    next(e);
  }
};

exports.pdfSemanaById = (req, res, next) => {
  try {
    const semanaId = Number(req.params.id);
    const semana = service.getSemanaById(semanaId);
    if (!semana) return res.status(404).send("Semana não encontrada");

    const consolidado = service.getEscalaSemanalPdfData().find((item) => item.semana === semana.semana_numero);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="escala-semanal.pdf"');

    const doc = generator.generateWeeklyPDF({
      rows: [
        {
          semanaNumero: String(semana.semana_numero),
          periodoTexto: `${generator.formatDateBr(semana.data_inicio)} até ${generator.formatDateBr(semana.data_fim)}`,
          noturno: consolidado?.noturno || { mecanico: [] },
          diurno: consolidado?.diurno || { mecanico: [] },
          observacoes: "Todos como Mecânico Industrial",
        },
      ],
    });
    doc.pipe(res);
    return doc;
  } catch (e) {
    next(e);
  }
};

exports.pdfPeriodo = (req, res, next) => {
  try {
    const start = String(req.query?.start || '').slice(0, 10);
    const end = String(req.query?.end || '').slice(0, 10);

    if ((start && !isValidDateISO(start)) || (end && !isValidDateISO(end))) {
      return res.status(400).json({
        ok: false,
        message: 'Parâmetros inválidos. Datas devem estar no formato YYYY-MM-DD.',
      });
    }

    if (start && end && end < start) {
      return res.status(400).json({
        ok: false,
        message: 'Data final não pode ser menor que a inicial.',
      });
    }

    if (start && end && daysInclusive(start, end) > 365) {
      return res.status(400).json({
        ok: false,
        message: 'O período máximo permitido para filtro é de 365 dias.',
      });
    }

    const data = service.getPeriodoCompensacaoData(start || null, end || null);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="escala-folgas.pdf"');
    const doc = generator.generatePeriodPDF({ start, end, ...data });
    doc.pipe(res);
    return doc;
  } catch (e) {
    next(e);
  }
};

function currentUser(req) { return req.user || req.session?.user || {}; }
function uploadPath(req) { return service.filePath(req.file); }
function redirectBack(req, res, fallback) { return res.redirect(req.get('Referrer') || fallback); }
function flashError(req, message) { if (req.flash) req.flash('error', message); }
function flashSuccess(req, message) { if (req.flash) req.flash('success', message); }

exports.horaExtraNova = (req, res, next) => { try {
  const user = currentUser(req);
  const colaborador = service.buscarColaboradorDoUsuario(user.id) || service.listarColaboradoresManutencao()[0] || null;
  const emAndamento = colaborador ? service.buscarHoraExtraEmAndamento(colaborador.id) : null;
  const historico = colaborador ? service.listarHorasExtras({ colaborador_id: colaborador.id }).slice(0, 10) : [];
  return res.render('escala/hora-extra-nova', { title: 'Registrar Hora Extra', colaborador, emAndamento, historico, osDisponiveis: service.listarOsDisponiveisParaHoraExtra() });
} catch(e){ next(e); } };

exports.iniciarHoraExtra = (req, res, next) => { try {
  const user = currentUser(req); const colaborador = service.buscarColaboradorDoUsuario(user.id) || service.listarColaboradoresManutencao().find(c => c.id === Number(req.body.colaborador_id));
  service.iniciarHoraExtra({ ...req.body, user_id: user.id, colaborador_id: colaborador?.id || req.body.colaborador_id, foto_inicio_path: uploadPath(req) });
  flashSuccess(req, 'Hora extra iniciada com sucesso.'); return res.redirect('/escala/hora-extra/nova');
} catch(e){ flashError(req, e.message); return res.redirect('/escala/hora-extra/nova'); } };

exports.finalizarHoraExtra = (req, res, next) => { try { service.finalizarHoraExtra(Number(req.params.id), { ...req.body, foto_fim_path: uploadPath(req) }); flashSuccess(req, 'Hora extra finalizada e enviada para aprovação.'); return res.redirect('/escala/hora-extra/nova'); } catch(e){ flashError(req, e.message); return res.redirect('/escala/hora-extra/nova'); } };
exports.horasExtrasPendentes = (req, res, next) => { try { return res.render('escala/hora-extra-pendentes', { title: 'Horas Extras Pendentes', pendentes: service.listarHorasExtrasPendentes() }); } catch(e){ next(e); } };
exports.aprovarHoraExtra = (req, res) => { try { service.aprovarHoraExtra(Number(req.params.id), currentUser(req), req.body.observacao); flashSuccess(req, 'Hora extra aprovada e creditada no banco.'); } catch(e){ flashError(req, e.message); } return res.redirect('/escala/hora-extra/pendentes'); };
exports.reprovarHoraExtra = (req, res) => { try { service.reprovarHoraExtra(Number(req.params.id), currentUser(req), req.body.motivo); flashSuccess(req, 'Hora extra reprovada.'); } catch(e){ flashError(req, e.message); } return res.redirect('/escala/hora-extra/pendentes'); };
exports.ajustarHoraExtra = (req, res) => { try { service.ajustarHoraExtra(Number(req.params.id), req.body, currentUser(req)); flashSuccess(req, 'Hora extra ajustada.'); } catch(e){ flashError(req, e.message); } return redirectBack(req, res, '/escala/hora-extra/pendentes'); };
exports.cancelarHoraExtra = (req, res) => { try { service.cancelarHoraExtra(Number(req.params.id), currentUser(req), req.body.motivo); flashSuccess(req, 'Hora extra cancelada.'); } catch(e){ flashError(req, e.message); } return redirectBack(req, res, '/escala/hora-extra/pendentes'); };
exports.bancoHoras = (req, res, next) => { try { const user=currentUser(req); const own=service.buscarColaboradorDoUsuario(user.id); const all=canViewAllEscala(req); const banco=service.listarBancoHoras({ colaborador_id: all ? null : own?.id }); return res.render('escala/banco-horas', { title: 'Banco de Horas', banco, selecionado: null, movimentos: [], horasExtras: [], folgas: [], canManageEscala: canManageEscala(req), canViewAllEscala: all }); } catch(e){ next(e); } };
exports.bancoHorasFuncionario = (req, res, next) => { try { let id=Number(req.params.colaboradorId); const user=currentUser(req); const own=service.buscarColaboradorDoUsuario(user.id); const all=canViewAllEscala(req); if(!all && own?.id !== id) return res.status(403).send('Acesso negado. Mecânico visualiza apenas o próprio banco de horas.'); const banco=service.listarBancoHoras({ colaborador_id: all ? null : own?.id }); const selecionado=banco.find(c=>c.id===id); return res.render('escala/banco-horas', { title: 'Banco de Horas', banco, selecionado, movimentos: service.listarMovimentosBancoHoras(id), horasExtras: service.listarHorasExtras({colaborador_id:id}), folgas: service.listarFolgas({colaborador_id:id}), canManageEscala: canManageEscala(req), canViewAllEscala: all }); } catch(e){ next(e); } };
exports.folgas = (req, res, next) => { try { return res.render('escala/folgas-programadas', { title: 'Programar Folga', colaboradores: service.listarBancoHoras(), folgas: service.listarFolgas() }); } catch(e){ next(e); } };
exports.programarFolga = (req, res) => { try { service.programarFolgaCompensatoria({ ...req.body, minutos_descontados: Math.round(Number(req.body.horas || 0) * 60) || Number(req.body.minutos_descontados), usuario: currentUser(req), user_id: currentUser(req).id }); flashSuccess(req, 'Folga compensatória programada.'); } catch(e){ flashError(req, e.message); } return res.redirect('/escala/folgas'); };
exports.cancelarFolga = (req, res) => { try { service.cancelarFolgaCompensatoria(Number(req.params.id), currentUser(req), req.body.motivo); flashSuccess(req, 'Folga cancelada e saldo estornado.'); } catch(e){ flashError(req, e.message); } return res.redirect('/escala/folgas'); };
exports.realizarFolga = (req, res) => { try { service.realizarFolgaCompensatoria(Number(req.params.id), currentUser(req)); flashSuccess(req, 'Folga marcada como realizada.'); } catch(e){ flashError(req, e.message); } return res.redirect('/escala/folgas'); };
exports.relatorios = (req, res, next) => { try { return res.render('escala/relatorios', { title: 'Relatórios PDF', colaboradores: service.listarColaboradoresManutencao(), osDisponiveis: service.listarOsDisponiveisParaHoraExtra() }); } catch(e){ next(e); } };
exports.relatorioPdf = (req, res, next) => { try { const doc = generator.gerarPdfBancoHorasGeral(service.gerarDadosRelatorioBancoHoras(req.query)); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition','inline; filename="banco-horas-manutencao.pdf"'); doc.pipe(res); return doc; } catch(e){ next(e); } };
exports.relatorioFuncionarioPdf = (req, res, next) => { try { const dados = service.gerarDadosRelatorioBancoHoras({ ...req.query, colaborador_id: Number(req.params.colaboradorId) }); const doc = generator.gerarPdfBancoHorasFuncionario(dados); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition','inline; filename="banco-horas-funcionario.pdf"'); doc.pipe(res); return doc; } catch(e){ next(e); } };
exports.relatorioOsPdf = (req, res, next) => { try { const dados = service.gerarDadosRelatorioBancoHoras({ ...req.query, os_id: Number(req.params.osId) }); const doc = generator.gerarPdfBancoHorasPorOs(dados); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition','inline; filename="banco-horas-os.pdf"'); doc.pipe(res); return doc; } catch(e){ next(e); } };

exports.recalcularCompleta = (req, res) => { try { const quantidade = Number(req.body.quantidade || 3); const r = service.recalcularEscalaCompleta({ quantidade }); reprocessarPreventivasComNovaEscala(); flashSuccess(req, `Escala recalculada: ${r.semanas} semana(s), ${r.alocacoes} alocação(ões).`); } catch(e){ flashError(req, e.message); } return res.redirect('/escala/completa'); };
