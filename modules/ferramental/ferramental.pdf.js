const pdf = require('../../utils/pdf-standard');
const service = require('./ferramental.service');

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

    pdf.sectionBand(doc, 'Termo de responsabilidade', meta);
    pdf.textBox(
      doc,
      'Os responsáveis acima declaram ciência da relação de ferramental e do local de guarda registrado. Nesta V1, a confirmação formal permanece por assinatura manual nesta ficha; a validação digital será implantada em etapa posterior.',
      meta,
      { fill: pdf.COLORS.greenSoft, fontSize: 8.5 }
    );

    data.equipe.membros.forEach((member) => signatureBlock(doc, member.name, meta));
    signatureBlock(doc, 'Responsável pela entrega / PCM', meta);
    doc.end();
  });

  return doc;
}

function generateUserPdf(userId) {
  const data = service.getUserSheet(userId);
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

    pdf.sectionBand(doc, 'Registro', meta);
    pdf.textBox(
      doc,
      'Documento gerado a partir da custódia ativa registrada no PCM. Ferramentas compartilhadas aparecem para todos os responsáveis do mesmo grupo sem duplicar o cadastro físico do item.',
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
