const pdf = require('../../utils/pdf-standard');
const service = require('./ferramental.service');
const aceiteService = require('./ferramental.aceite.service');

function statusText(value) {
  const map = {
    DISPONIVEL: 'Disponível',
    EM_RESPONSABILIDADE: 'Em responsabilidade',
    EM_MANUTENCAO: 'Em manutenção',
    DANIFICADA: 'Danificada',
    EXTRAVIADA: 'Extraviada',
    BAIXADA: 'Baixada',
  };
  return map[String(value || '').toUpperCase()] || String(value || '-');
}

function conditionText(value) {
  const map = {
    NOVA: 'Nova',
    BOA: 'Boa',
    USADA: 'Usada',
    COM_DESGASTE: 'Com desgaste',
    DANIFICADA: 'Danificada',
  };
  return map[String(value || '').toUpperCase()] || String(value || '-');
}

function acceptanceStatusText(value) {
  const map = { PENDENTE: 'Pendente', ACEITO: 'Confirmado', RECUSADO: 'Divergência', CANCELADO: 'Cancelado' };
  return map[String(value || '').toUpperCase()] || String(value || '-');
}

function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('pt-BR');
}

function memberNames(members = []) {
  return members.map((member) => member.name).filter(Boolean).join(' + ') || '-';
}

function toolText(item) {
  const ids = [
    item.numero_serie ? `Série: ${item.numero_serie}` : '',
    item.patrimonio ? `Patrimônio: ${item.patrimonio}` : '',
  ].filter(Boolean).join(' • ');
  const local = item.armario_codigo
    ? `${item.armario_codigo} / Compartimento ${item.compartimento_numero}`
    : 'Sem local definido';
  return [
    `${item.codigo_interno} • ${item.descricao}`,
    ids || 'Sem número de série/patrimônio informado',
    `Condição: ${conditionText(item.condicao)} • Status: ${statusText(item.status)} • Local: ${local}`,
  ].join('\n');
}

function signatureBlock(doc, label, meta) {
  pdf.ensureSpace(doc, 48, meta);
  const x = pdf.PAGE.margins.left;
  const width = doc.page.width - pdf.PAGE.margins.left - pdf.PAGE.margins.right;
  const y = doc.y + 18;
  doc.save();
  doc.strokeColor(pdf.COLORS.border).lineWidth(0.8)
    .moveTo(x, y).lineTo(x + Math.min(230, width * 0.45), y).stroke();
  doc.fillColor(pdf.COLORS.muted).font('Helvetica').fontSize(8)
    .text(label, x, y + 5, { width: Math.min(230, width * 0.45), align: 'center' });
  doc.restore();
  doc.y = y + 28;
}

function generateTeamPdf(teamId) {
  const data = service.getTeamSheet(teamId);
  const aceites = aceiteService.teamAcceptances(teamId);
  const meta = {
    title: 'Ficha de Responsabilidade de Ferramental',
    subtitle: 'Campo do Gado • Manutenção Industrial • PCM',
  };
  const doc = pdf.createDoc({ title: `Ferramental - ${data.equipe.codigo}` });

  process.nextTick(() => {
    pdf.setupPage(doc, meta);
    pdf.sectionBand(doc, 'Identificação', meta);
    pdf.infoBox(doc, [
      { label: 'Grupo', value: `${data.equipe.codigo} - ${data.equipe.nome}` },
      { label: 'Responsáveis', value: memberNames(data.equipe.membros) },
      { label: 'Ferramentas vinculadas', value: String(data.ferramentas.length) },
      { label: 'Emissão', value: new Date().toLocaleDateString('pt-BR') },
    ], meta, { columns: 2 });

    pdf.sectionBand(doc, 'Ferramental sob responsabilidade', meta);
    if (!data.ferramentas.length) {
      pdf.textBox(doc, 'Nenhuma ferramenta está vinculada a este grupo neste momento.', meta);
    } else {
      data.ferramentas.forEach((item) => pdf.textBox(doc, toolText(item), meta, {
        fill: pdf.COLORS.white,
        fontSize: 8.5,
      }));
    }

    pdf.sectionBand(doc, 'Confirmações digitais V1.1', meta);
    if (!aceites.length) {
      pdf.textBox(doc, 'Nenhum aceite digital foi gerado para esta responsabilidade.', meta);
    } else {
      aceites.forEach((aceite) => {
        const when = aceite.confirmado_em || aceite.recusado_em;
        const evidenceText = aceite.status === 'ACEITO'
          ? 'Selfie e assinatura digital arquivadas no sistema.'
          : aceite.status === 'RECUSADO'
            ? `Motivo: ${aceite.observacao || 'não informado'}`
            : 'Aguardando confirmação individual no Meu Portal.';
        pdf.textBox(doc, [
          `${aceite.codigo_interno} • ${aceite.descricao}`,
          `Responsável: ${aceite.usuario_nome}`,
          `Status: ${acceptanceStatusText(aceite.status)} • Data/hora: ${formatDateTime(when)}`,
          evidenceText,
        ].join('\n'), meta, { fill: pdf.COLORS.white, fontSize: 8.3 });
      });
    }

    pdf.sectionBand(doc, 'Termo de responsabilidade', meta);
    pdf.textBox(
      doc,
      'Cada responsável deve confirmar individualmente o recebimento no Meu Portal. O aceite V1.1 registra usuário, data/hora, selfie, assinatura digital e trilha de auditoria. Registros pendentes ou com divergência permanecem destacados até revisão.',
      meta,
      { fill: pdf.COLORS.greenSoft, fontSize: 8.5 }
    );

    signatureBlock(doc, 'Responsável pela entrega / PCM', meta);
    doc.end();
  });

  return doc;
}

function generateUserPdf(userId) {
  const data = service.getUserSheet(userId);
  const aceites = aceiteService.listOwnAcceptances(userId);
  const confirmados = aceites.filter((item) => item.status === 'ACEITO').length;
  const pendentes = aceites.filter((item) => item.status === 'PENDENTE').length;
  const divergencias = aceites.filter((item) => item.status === 'RECUSADO').length;
  const meta = {
    title: 'Meu Ferramental',
    subtitle: 'Campo do Gado • Manutenção Industrial • Meu Portal',
  };
  const doc = pdf.createDoc({ title: `Meu Ferramental - ${data.usuario?.name || userId}` });

  process.nextTick(() => {
    pdf.setupPage(doc, meta);
    pdf.sectionBand(doc, 'Responsabilidade atual', meta);
    pdf.infoBox(doc, [
      { label: 'Colaborador', value: data.usuario?.name || '-' },
      { label: 'Ferramentas', value: String(data.resumo.total) },
      { label: 'Compartilhadas', value: String(data.resumo.compartilhadas) },
      { label: 'Grupos', value: String(data.resumo.grupos) },
      { label: 'Confirmados', value: String(confirmados) },
      { label: 'Pendentes', value: String(pendentes) },
      { label: 'Divergências', value: String(divergencias) },
    ], meta, { columns: 2 });

    if (!data.equipes.length) {
      pdf.textBox(doc, 'Nenhuma ferramenta está atualmente registrada sob sua responsabilidade.', meta);
    } else {
      data.equipes.forEach((group) => {
        pdf.sectionBand(doc, `${group.codigo} - ${group.nome}`, meta);
        pdf.textBox(doc, `Responsáveis: ${memberNames(group.membros)}`, meta, {
          fill: pdf.COLORS.greenSoft,
          fontSize: 8.5,
        });
        group.ferramentas.forEach((item) => pdf.textBox(doc, toolText(item), meta, {
          fill: pdf.COLORS.white,
          fontSize: 8.5,
        }));
      });
    }

    pdf.sectionBand(doc, 'Meus aceites V1.1', meta);
    if (!aceites.length) {
      pdf.textBox(doc, 'Nenhum aceite digital está vinculado às custódias atuais.', meta);
    } else {
      aceites.forEach((aceite) => {
        const when = aceite.confirmado_em || aceite.recusado_em;
        const detail = aceite.status === 'ACEITO'
          ? 'Selfie e assinatura digital arquivadas de forma privada.'
          : aceite.status === 'RECUSADO'
            ? `Divergência: ${aceite.observacao || 'sem detalhe'}`
            : 'Aguardando confirmação no Meu Portal.';
        pdf.textBox(doc, [
          `${aceite.codigo_interno} • ${aceite.descricao}`,
          `Status: ${acceptanceStatusText(aceite.status)} • Data/hora: ${formatDateTime(when)}`,
          detail,
        ].join('\n'), meta, { fill: pdf.COLORS.white, fontSize: 8.3 });
      });
    }

    pdf.sectionBand(doc, 'Registro', meta);
    pdf.textBox(
      doc,
      'Documento gerado a partir da custódia ativa e dos aceites V1.1 registrados no PCM. Ferramentas compartilhadas aparecem para todos os responsáveis sem duplicar o ativo; cada responsável mantém seu próprio aceite e evidência.',
      meta,
      { fontSize: 8.2, fill: pdf.COLORS.yellow, stroke: pdf.COLORS.yellowBorder }
    );
    doc.end();
  });

  return doc;
}

module.exports = {
  generateTeamPdf,
  generateUserPdf,
};
