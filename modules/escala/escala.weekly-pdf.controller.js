const service = require('./escala.service');
const weeklyPdf = require('./escala.weekly-pdf');

function rowFromService(item) {
  return {
    semanaNumero: String(item.semana),
    periodoTexto: `${weeklyPdf.formatDateBr(item.data_inicio)} até ${weeklyPdf.formatDateBr(item.data_fim)}`,
    noturno: item.noturno,
    diurno: item.diurno,
    observacoes: item.ajuste_manual
      ? 'Semana ajustada manualmente pelo encarregado.'
      : (item.observacao || 'Todos como Mecânico Industrial'),
  };
}

function sendPdf(res, doc) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="escala-semanal.pdf"');
  doc.pipe(res);
  return doc;
}

function pdfSemana(_req, res, next) {
  try {
    const rows = service.getEscalaSemanalPdfData().map(rowFromService);
    return sendPdf(res, weeklyPdf.generateWeeklyPDF({
      rows,
      coberturas: service.listarFolgasSabado(),
    }));
  } catch (error) {
    return next(error);
  }
}

function pdfSemanaById(req, res, next) {
  try {
    const semanaId = Number(req.params.id);
    const semana = service.getSemanaById(semanaId);
    if (!semana) return res.status(404).send('Semana não encontrada');

    const consolidado = service.getEscalaSemanalPdfData()
      .find((item) => Number(item.semana) === Number(semana.semana_numero));

    const row = {
      semanaNumero: String(semana.semana_numero),
      periodoTexto: `${weeklyPdf.formatDateBr(semana.data_inicio)} até ${weeklyPdf.formatDateBr(semana.data_fim)}`,
      noturno: consolidado?.noturno || { mecanico: [] },
      diurno: consolidado?.diurno || { mecanico: [] },
      observacoes: semana.ajuste_manual
        ? 'Semana ajustada manualmente pelo encarregado.'
        : (semana.observacao || 'Todos como Mecânico Industrial'),
    };

    return sendPdf(res, weeklyPdf.generateWeeklyPDF({
      rows: [row],
      coberturas: service.listarFolgasSabado().filter((item) => Number(item.semana_id) === semanaId),
    }));
  } catch (error) {
    return next(error);
  }
}

module.exports = { pdfSemana, pdfSemanaById };
