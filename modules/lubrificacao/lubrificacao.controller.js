const service = require('./lubrificacao.service');
const semanaService = require('./lubrificacao-semana.service');
const PDFDocument = require('pdfkit');

function index(req, res) {
  res.locals.activeMenu = 'lubrificacao';
  const status = String(req.query.status || 'TODOS').toUpperCase();
  const semana = semanaService.getSemanaPorReferencia();
  try {
    const roteiro = service.listRoteiro(req.session.user.id, status);
    return res.render('lubrificacao/index', {
      title: 'Roteiro de Lubrificação',
      status,
      roteiro,
      rotas: service.agruparRoteiro(roteiro),
      resumo: service.resumoRoteiro(req.session.user.id),
      historico: service.listHistorico(req.session.user.id, 12),
      semana,
      isResponsavelSemana: !semana?.responsavel_user_id || Number(semana.responsavel_user_id) === Number(req.session.user.id),
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar seu roteiro de lubrificação.');
    return res.render('lubrificacao/index', {
      title: 'Roteiro de Lubrificação',
      status,
      roteiro: [],
      rotas: [],
      resumo: { total: 0, rotas: 0, atrasados: 0, hoje: 0, proximos: 0, executados_hoje: 0 },
      historico: [],
      semana,
      isResponsavelSemana: !semana?.responsavel_user_id || Number(semana.responsavel_user_id) === Number(req.session.user.id),
    });
  }
}

function executar(req, res) {
  try {
    const result = service.registrarExecucao(req.params.id, req.session.user.id, req.body || {});
    const base = result.anomalia
      ? 'Lubrificação registrada. A anomalia ficou destacada no histórico para acompanhamento do PCM.'
      : 'Lubrificação concluída e próxima execução atualizada.';
    const osInfo = result.os_concluida
      ? ` OS #${result.os_id} concluída automaticamente porque todos os pontos do equipamento foram executados.`
      : (result.os_progresso
        ? ` OS #${result.os_id}: ${result.os_progresso.executados}/${result.os_progresso.total} ponto(s) concluído(s).`
        : '');
    req.flash('success', base + osInfo);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a execução.');
  }
  return res.redirect('/lubrificacao');
}

function relatorioSemanalPdf(req, res) {
  const relatorio = semanaService.getRelatorioSemana(req.query.semana || null);
  const userId = Number(req.session?.user?.id || 0);

  if (relatorio.semana?.responsavel_user_id && Number(relatorio.semana.responsavel_user_id) !== userId) {
    return res.status(403).send('O relatório desta semana pertence ao mecânico responsável pelo plano de lubrificação.');
  }

  const execucoes = relatorio.semana?.responsavel_user_id
    ? relatorio.execucoes
    : relatorio.execucoes.filter((item) => Number(item.executor_user_id) === userId);

  const doc = new PDFDocument({ margin: 34, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-lubrificacao-${relatorio.inicio}.pdf"`);
  doc.pipe(res);

  doc.fillColor('#137a3a').fontSize(17).text('CAMPO DO GADO', { align: 'center' });
  doc.fillColor('#10233e').fontSize(15).text('Relatório Semanal de Lubrificação', { align: 'center' });
  doc.fillColor('#5d6c7d').fontSize(9).text(
    `Semana: ${relatorio.inicio} a ${relatorio.fim} | Responsável: ${relatorio.semana?.responsavel_nome || req.session?.user?.name || 'Não definido'}`,
    { align: 'center' }
  );
  doc.moveDown();

  doc.fillColor('#10233e').fontSize(10)
    .text(`Execuções registradas: ${execucoes.length} | OS automáticas: ${relatorio.osProgramadas.length} | Atrasados atuais: ${relatorio.resumo.atrasados}`);
  doc.moveDown(0.6);

  doc.fillColor('#137a3a').fontSize(11).text('EXECUÇÕES');
  doc.moveDown(0.3);
  if (!execucoes.length) {
    doc.fillColor('#5d6c7d').fontSize(9).text('Nenhuma execução registrada nesta semana.');
  } else {
    execucoes.forEach((item) => {
      const qtd = item.quantidade_utilizada == null ? '-' : `${item.quantidade_utilizada} ${item.unidade || ''}`;
      const os = item.os_numero ? ` | OS #${item.os_numero}` : '';
      const anomalia = Number(item.anomalia) === 1 ? ' | ANOMALIA' : '';
      doc.fillColor('#10233e').fontSize(8)
        .text(`${item.executed_at || '-'} | ${item.equipamento_nome} | ${item.ponto_lubrificacao} | ${qtd}${os}${anomalia}`);
      if (item.anomalia_descricao) {
        doc.fillColor('#a71921').fontSize(7.5).text(`  Anomalia: ${item.anomalia_descricao}`);
      }
    });
  }

  doc.moveDown();
  doc.fillColor('#137a3a').fontSize(11).text('OS AUTOMÁTICAS DA SEMANA');
  doc.moveDown(0.3);
  if (!relatorio.osProgramadas.length) {
    doc.fillColor('#5d6c7d').fontSize(9).text('Nenhuma OS automática de lubrificação gerada na semana.');
  } else {
    relatorio.osProgramadas.forEach((item) => {
      doc.fillColor('#10233e').fontSize(8)
        .text(`${item.data_programada} | OS #${item.os_id || '-'} | ${item.equipamento_nome} | ${item.os_status || item.status || '-'}`);
    });
  }

  doc.end();
}

module.exports = { index, executar, relatorioSemanalPdf };
