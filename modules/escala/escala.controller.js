const service = require("./escala.service");
const generator = require("./escala.pdf");

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

exports.index = (req, res, next) => {
  try {
    res.locals.activeMenu = "escala";

    const date = String(req.query?.date || "").slice(0, 10);
    const alvo = date || isoToday();

    const semana = service.getSemanaPorData(alvo);
    const publicacoes = service.getPublicacoes();
    const monthRange = getCurrentMonthRangeISO();
    const pdfStart = String(req.query?.start || monthRange.start).slice(0, 10);
    const pdfEnd = String(req.query?.end || monthRange.end).slice(0, 10);

    return res.render("escala/index", {
      title: "Escala",
      alvo,
      semana,
      publicacoes,
      pdfStart,
      pdfEnd,
    });
  } catch (e) {
    next(e);
  }
};

exports.completa = (req, res, next) => {
  try {
    res.locals.activeMenu = "escala";
    const semanas = service.getEscalaCompletaComTimes();
    return res.render("escala/completa", { title: "Escala Completa", semanas });
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
      return res.redirect(`/escala?date=${dateRef}`);
    }
    if (fim < inicio) {
      req.flash("error", "Data final não pode ser menor que data inicial.");
      return res.redirect(`/escala?date=${inicio}`);
    }
    if (!nome) {
      req.flash("error", "Informe o nome do colaborador.");
      return res.redirect(`/escala?date=${inicio}`);
    }
    if (!turno) {
      req.flash("error", "Turno inválido. Use Dia, Noite, Apoio ou Plantão.");
      return res.redirect(`/escala?date=${inicio}`);
    }
    if (!funcao) {
      req.flash("error", "Função inválida. Use Mecânico, Auxiliar ou Operacional.");
      return res.redirect(`/escala?date=${inicio}`);
    }

    const resultado = service.adicionarRapidoPeriodo({
      inicio,
      fim,
      nome,
      tipo_turno: turno,
      funcao,
    });

    let msg = `Período salvo com sucesso (${resultado.semanasAfetadas} semana(s): ${resultado.inserted} inserção(ões), ${resultado.updated} atualização(ões), ${resultado.ignored} sem alterações).`;
    if (resultado.diasSemSemana > 0) {
      msg += ` ${resultado.diasSemSemana} dia(s) do período não possuem semana cadastrada e foram ignorados.`;
    }

    req.flash("success", msg);
    return res.redirect(`/escala?date=${inicio}`);
  } catch (e) {
    next(e);
  }
};

exports.lancarAusencia = (req, res, next) => {
  try {
    const date = String(req.body?.date || "").slice(0, 10) || isoToday();
    const nome = String(req.body?.nome || "").trim();
    const tipo = String(req.body?.tipo || "").trim().toUpperCase();
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
      return res.redirect(`/escala?date=${date}`);
    }

    if (inicio > fim) {
      req.flash("error", "Data início não pode ser maior que data fim.");
      return res.redirect(`/escala?date=${date}`);
    }

    if (!["FOLGA", "ATESTADO", "FERIAS"].includes(tipo)) {
      req.flash("error", "Tipo inválido (use Folga, Férias ou Atestado).");
      return res.redirect(`/escala?date=${date}`);
    }

    if (tipo === "ATESTADO" && !motivo) {
      req.flash("error", "Motivo é obrigatório para atestado.");
      return res.redirect(`/escala?date=${date}`);
    }

    if (tipo === "FOLGA") {
      const hasAnyCompField = dataServico || horaInicio || horaFim || equipamento || descricaoServico;
      if (hasAnyCompField && (!dataServico || !horaInicio || !horaFim || !equipamento || !descricaoServico)) {
        req.flash("error", "Para folga por compensação, preencha todos os campos do serviço prestado.");
        return res.redirect(`/escala?date=${date}`);
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

    req.flash("success", "Concessão lançada com sucesso.");
    return res.redirect(`/escala?date=${date}`);
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
      return res.redirect(`/escala?date=${date}`);
    }

    const ok = service.removerAlocacao(alocacaoId);
    if (!ok) {
      req.flash("error", "Registro não encontrado para exclusão.");
      return res.redirect(`/escala?date=${date}`);
    }

    req.flash("success", "Registro removido com sucesso.");
    return res.redirect(`/escala?date=${date}`);
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
      novoTurno === "apoio" ? "apoio" :
      novoTurno === "folga" ? "folga" :
      novoTurno === "plantao" ? "plantao" :
      "";

    if (!alocacaoId || !tipo_turno) {
      req.flash("error", "Dados inválidos para edição.");
      return res.redirect(`/escala/editar/${semanaId}`);
    }

    service.atualizarTurno(alocacaoId, tipo_turno);

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
      apoioOperacionalDiurno: s.apoio,
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
          noturno: consolidado?.noturno || { mecanico: [], auxiliar: [], operacional: [] },
          diurno: consolidado?.diurno || { mecanico: [], auxiliar: [], operacional: [] },
          apoioOperacionalDiurno: consolidado?.apoio || { mecanico: [], auxiliar: [], operacional: [] },
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