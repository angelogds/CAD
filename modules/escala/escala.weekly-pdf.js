const pdfStandard = require('../../utils/pdf-standard');

function formatDateBr(value) {
  const raw = String(value || '').slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (raw || '-');
}

function names(group) {
  return Array.isArray(group?.mecanico) ? group.mecanico.filter(Boolean) : [];
}

function roleText(group) {
  const lista = names(group);
  return lista.length ? lista.join(', ') : '-';
}

function uniqueNames(rows, key) {
  return new Set((rows || []).flatMap((row) => names(row?.[key])).map((name) => String(name).trim()).filter(Boolean));
}

function generateWeeklyPDF({ rows = [], coberturas = [], issuedAt = new Date() } = {}) {
  const report = pdfStandard.createReport({
    title: 'Escala Semanal – Manutenção Industrial',
    subtitle: 'Programação de turnos, plantões, folgas e cobertura operacional',
    issuedAt: formatDateBr(new Date(issuedAt).toISOString().slice(0, 10)),
    sector: 'MANUTENÇÃO',
    headerContext: 'Escala semanal | Manutenção Campo do Gado',
    footerText: 'Manutenção Campo do Gado - Escala semanal de trabalho e cobertura operacional.',
    subject: 'Escala semanal da Manutenção Industrial',
  });

  const diurnos = uniqueNames(rows, 'diurno');
  const noturnos = uniqueNames(rows, 'noturno');

  process.nextTick(() => {
    try {
      report.start();
      report.identification([
        ['Empresa / Unidade', 'Reciclagem Campo do Gado', 'Setor', 'Manutenção Industrial'],
        ['Documento', 'Escala semanal de trabalho', 'Emissão', formatDateBr(new Date(issuedAt).toISOString().slice(0, 10))],
        ['Semanas relacionadas', String(rows.length), 'Coberturas de sábado', String(coberturas.length)],
      ]);

      report.summary([
        { label: 'SEMANAS', value: String(rows.length) },
        { label: 'MECÂNICOS DIURNOS', value: String(diurnos.size) },
        { label: 'PLANTONISTAS NOTURNOS', value: String(noturnos.size) },
        { label: 'COBERTURAS DE SÁBADO', value: String(coberturas.length) },
      ]);

      report.table({
        title: 'Escala semanal',
        columns: [
          { key: 'semana', label: 'Semana', width: 54, align: 'center' },
          { key: 'periodo', label: 'Período', width: 98, align: 'center' },
          { key: 'noturno', label: 'Plantão noturno', width: 128 },
          { key: 'diurno', label: 'Equipe diurna', width: 150 },
          { key: 'observacoes', label: 'Observações', width: 120 },
        ],
        rows: rows.map((item) => ({
          semana: String(item.semanaNumero || item.semana || '-'),
          periodo: item.periodoTexto || item.periodo || '-',
          noturno: roleText(item.noturno),
          diurno: roleText(item.diurno),
          observacoes: item.observacoes || 'Todos como Mecânico Industrial',
        })),
        emptyText: 'Nenhuma semana cadastrada para emissão.',
      });

      report.table({
        title: 'Folgas e cobertura de sábado',
        columns: [
          { key: 'semana', label: 'Semana', width: 48, align: 'center' },
          { key: 'sexta', label: 'Sexta-feira', width: 72, align: 'center' },
          { key: 'folga', label: 'Colaborador de folga', width: 118 },
          { key: 'sabado', label: 'Sábado', width: 72, align: 'center' },
          { key: 'equipe', label: 'Equipe de sábado', width: 130 },
          { key: 'observacao', label: 'Observação', width: 118 },
        ],
        rows: coberturas.map((item) => ({
          semana: String(item.semana_numero || '-'),
          sexta: formatDateBr(item.data_sexta),
          folga: item.colaborador_folga || '-',
          sabado: formatDateBr(item.data_sabado),
          equipe: [item.substituto_diogo || item.colaborador_fixo, item.parceiro_diogo].filter(Boolean).join(' e ') || '-',
          observacao: item.observacao || 'Compensação após plantão noturno',
        })),
        emptyText: 'Nenhuma cobertura de sábado cadastrada para o período.',
      });

      report.note('A escala deve refletir a programação vigente da Manutenção. Alterações de turno, folga, plantão ou cobertura devem ser atualizadas no sistema pelo perfil autorizado para preservar o histórico e a rastreabilidade.');
      report.end();
    } catch (error) {
      report.doc.destroy(error);
    }
  });

  return report.doc;
}

module.exports = { generateWeeklyPDF, formatDateBr };
