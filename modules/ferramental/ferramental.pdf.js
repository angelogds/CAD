const pdf = require('../../utils/pdf-standard');
const service = require('./ferramental.service');
const aceiteService = require('./ferramental.aceite.service');
const inventarioService = require('./ferramental.inventario.service');
const ocorrenciaService = require('./ferramental.ocorrencia.service');
const inspecaoService = require('./ferramental.inspecao.service');

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
  const conferencias = inventarioService.listDashboard().inventories
    .filter((item) => Number(item.equipe_id) === Number(teamId))
    .slice(0, 5);
  const ocorrencias = ocorrenciaService.dashboard().recentes
    .filter((item) => Number(item.equipe_id) === Number(teamId))
    .slice(0, 10);
  const inspecoes = data.ferramentas.map((item) => ({
    ...item,
    situacaoInspecao: inspecaoService.toolInspectionStatus(item.id),
  }));
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

    pdf.sectionBand(doc, 'Conferências periódicas V1.2', meta);
    if (!conferencias.length) {
      pdf.textBox(doc, 'Nenhuma conferência periódica registrada para esta equipe.', meta);
    } else {
      conferencias.forEach((inv) => {
        const total = Number(inv.total_itens || 0);
        const done = Number(inv.conferidos || 0);
        pdf.textBox(doc, [
          `${inv.codigo} • ${inv.titulo}`,
          `Status: ${inv.status} • Progresso: ${done}/${total} • Divergências: ${Number(inv.divergencias || 0)}`,
          inv.data_limite ? `Data limite: ${new Date(inv.data_limite + 'T12:00:00').toLocaleDateString('pt-BR')}` : 'Sem data limite definida',
        ].join('\n'), meta, { fill: pdf.COLORS.white, fontSize: 8.3 });
      });
    }

    pdf.sectionBand(doc, 'Ocorrências V1.3', meta);
    if (!ocorrencias.length) {
      pdf.textBox(doc, 'Nenhuma ocorrência registrada recentemente para esta equipe.', meta);
    } else {
      ocorrencias.forEach((occ) => {
        pdf.textBox(doc, [
          `${occ.codigo} • ${occ.codigo_interno} • ${occ.ferramenta_descricao}`,
          `Tipo: ${String(occ.tipo || '-').replaceAll('_', ' ')} • Status: ${String(occ.status || '-').replaceAll('_', ' ')}`,
          `Aberta por: ${occ.aberta_por_nome || '-'} • ${formatDateTime(occ.created_at)}`,
          occ.resolucao ? `Tratamento PCM: ${occ.resolucao}` : `Descrição: ${occ.descricao || '-'}`,
        ].join('\n'), meta, { fill: pdf.COLORS.white, fontSize: 8.2 });
      });
    }

    pdf.sectionBand(doc, 'Inspeções de segurança V1.4', meta);
    if (!inspecoes.length) {
      pdf.textBox(doc, 'Nenhuma ferramenta vinculada para avaliação de inspeção.', meta);
    } else {
      inspecoes.forEach((item) => {
        const state = item.situacaoInspecao || {};
        const nextDate = state.next?.data_programada
          ? new Date(state.next.data_programada + 'T12:00:00').toLocaleDateString('pt-BR')
          : '-';
        const lastText = state.last
          ? `${state.last.codigo} • ${String(state.last.status || '-').replaceAll('_', ' ')}`
          : 'Sem inspeção concluída';
        pdf.textBox(doc, [
          `${item.codigo_interno} • ${item.descricao}`,
          `Situação: ${String(state.situation || 'SEM_PLANO').replaceAll('_', ' ')} • Próxima: ${nextDate}`,
          `Última: ${lastText}`,
          state.block ? `BLOQUEADA — NÃO USAR: ${state.block.motivo}` : 'Sem bloqueio técnico ativo.',
        ].join('\n'), meta, {
          fill: state.block ? pdf.COLORS.yellow : pdf.COLORS.white,
          fontSize: 8.2,
        });
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
  const conferencias = inventarioService.listOwn(userId);
  const ocorrencias = ocorrenciaService.listOwn(userId).slice(0, 15);
  const inspecoes = inspecaoService.ownStatus(userId);
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
      { label: 'Conferências pendentes', value: String(conferencias.filter((item) => item.situacao === 'PENDENTE').length) },
      { label: 'Alertas de inspeção', value: String(inspecoes.filter((item) => ['BLOQUEADA','VENCIDA','A_VENCER'].includes(item.inspecao?.situation)).length) },
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

    pdf.sectionBand(doc, 'Conferências V1.2 em andamento', meta);
    if (!conferencias.length) {
      pdf.textBox(doc, 'Nenhuma conferência periódica aberta para o colaborador.', meta);
    } else {
      conferencias.forEach((item) => {
        pdf.textBox(doc, [
          `${item.inventario_codigo} • ${item.codigo_interno} • ${item.descricao}`,
          `Situação: ${String(item.situacao || '-').replaceAll('_', ' ')} • Data: ${formatDateTime(item.conferido_em)}`,
          item.observacao ? `Observação: ${item.observacao}` : 'Sem observação registrada.',
        ].join('\n'), meta, { fill: pdf.COLORS.white, fontSize: 8.3 });
      });
    }

    pdf.sectionBand(doc, 'Minhas ocorrências V1.3', meta);
    if (!ocorrencias.length) {
      pdf.textBox(doc, 'Nenhuma ocorrência vinculada ao ferramental atual do colaborador.', meta);
    } else {
      ocorrencias.forEach((occ) => {
        pdf.textBox(doc, [
          `${occ.codigo} • ${occ.codigo_interno} • ${occ.ferramenta_descricao}`,
          `Tipo: ${String(occ.tipo || '-').replaceAll('_', ' ')} • Status: ${String(occ.status || '-').replaceAll('_', ' ')}`,
          occ.resolucao ? `Tratamento PCM: ${occ.resolucao}` : `Descrição: ${occ.descricao || '-'}`,
        ].join('\n'), meta, { fill: pdf.COLORS.white, fontSize: 8.2 });
      });
    }

    pdf.sectionBand(doc, 'Inspeções de segurança V1.4', meta);
    if (!inspecoes.length) {
      pdf.textBox(doc, 'Nenhuma ferramenta atual possui informação de inspeção.', meta);
    } else {
      inspecoes.forEach((item) => {
        const state = item.inspecao || {};
        const nextDate = state.next?.data_programada
          ? new Date(state.next.data_programada + 'T12:00:00').toLocaleDateString('pt-BR')
          : '-';
        pdf.textBox(doc, [
          `${item.codigo_interno} • ${item.descricao}`,
          `Situação: ${String(state.situation || 'SEM_PLANO').replaceAll('_', ' ')} • Próxima: ${nextDate}`,
          state.block ? `BLOQUEADA — NÃO USAR: ${state.block.motivo}` : 'Sem bloqueio técnico ativo.',
        ].join('\n'), meta, {
          fill: state.block ? pdf.COLORS.yellow : pdf.COLORS.white,
          fontSize: 8.2,
        });
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
