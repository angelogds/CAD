const fs = require('node:fs');
const path = require('node:path');
const db = require('../../database/db');
const storage = require('../../config/storage');
const escala = require('../escala/escala.service');
const folgaSolicitacoes = require('../escala/escala.folga-solicitacao.service');
const pdf = require('../../utils/pdf-standard');

function tableExists(name) {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
  catch (_error) { return false; }
}

function collaborator(id) {
  if (!tableExists('colaboradores')) return null;
  return db.prepare('SELECT * FROM colaboradores WHERE id=? LIMIT 1').get(Number(id)) || null;
}

function leaveProgram(id) {
  if (!id || !tableExists('escala_folgas_programadas')) return null;
  return db.prepare('SELECT * FROM escala_folgas_programadas WHERE id=? LIMIT 1').get(Number(id)) || null;
}

function resolveImage(value) {
  const raw = String(value || '').trim();
  if (!raw || /^https?:\/\//i.test(raw)) return null;
  const candidates = [];
  if (raw.startsWith('/imagens/')) candidates.push(path.join(storage.IMAGE_DIR, raw.slice('/imagens/'.length)));
  if (raw.startsWith('/uploads/')) candidates.push(path.join(storage.UPLOAD_DIR, raw.slice('/uploads/'.length)));
  if (raw.startsWith('/')) candidates.push(path.join(process.cwd(), 'public', raw));
  candidates.push(path.resolve(raw));
  return candidates.find((target) => {
    try { return fs.statSync(target).isFile(); } catch (_error) { return false; }
  }) || null;
}

function photoPath(row = {}) {
  return resolveImage(row.foto_url || row.foto_path || row.foto || row.avatar_path || row.imagem);
}

function originText(folga = {}) {
  const parts = [];
  if (folga.data_servico) parts.push(`Serviço em ${pdf.formatDate(folga.data_servico)}`);
  if (folga.hora_inicio || folga.hora_fim) parts.push(`${folga.hora_inicio || '-'} às ${folga.hora_fim || '-'}`);
  if (folga.equipamento) parts.push(`Local/equipamento: ${folga.equipamento}`);
  if (folga.descricao_servico) parts.push(`Serviço: ${folga.descricao_servico}`);
  return parts.length ? parts.join(' • ') : 'Origem não informada — compensação vinculada ao saldo consolidado do Banco de Horas.';
}

function getLeaveData(requestId) {
  const request = folgaSolicitacoes.getSolicitacao(Number(requestId));
  if (!request) throw new Error('Solicitação de folga não encontrada.');
  if (String(request.status || '').toUpperCase() !== 'APROVADA') {
    throw new Error('O PDF individual é disponibilizado após a aprovação da folga.');
  }
  const colab = collaborator(request.colaborador_id) || {};
  const folga = leaveProgram(request.folga_id) || {};
  const saldoAtual = escala.calcularSaldoBancoHoras(request.colaborador_id);
  return { request, colaborador: colab, folga, saldoAtual };
}

function drawProfile(doc, meta, colab = {}) {
  const photo = photoPath(colab);
  if (!photo) return;
  pdf.ensureSpace(doc, 70, meta);
  const x = pdf.PAGE.margins.left;
  const y = doc.y;
  let saved = false;
  try {
    doc.save();
    saved = true;
    doc.roundedRect(x, y, 58, 58, 6).strokeColor(pdf.COLORS.border).stroke();
    doc.image(photo, x + 3, y + 3, { fit: [52, 52], align: 'center', valign: 'center' });
    doc.y = y + 66;
  } catch (_error) {
    doc.y = y;
  } finally {
    if (saved) {
      try { doc.restore(); } catch (_error) {}
    }
  }
}

function generateLeavePdf({ requestId }) {
  const data = getLeaveData(requestId);
  const { request, colaborador: colab, folga, saldoAtual } = data;
  const meta = {
    title: 'Folga / Banco de Horas',
    subtitle: 'Campo do Gado • Manutenção Industrial • RH e Escala',
  };
  const doc = pdf.createDoc({ title: `Folga aprovada - ${request.colaborador_nome || request.id}` });

  process.nextTick(() => {
    pdf.setupPage(doc, meta);
    pdf.sectionBand(doc, 'Identificação do colaborador', meta);
    drawProfile(doc, meta, colab);
    pdf.infoBox(doc, [
      { label: 'Colaborador', value: request.colaborador_nome || colab.nome || '-' },
      { label: 'Função', value: colab.funcao || request.funcao || '-' },
      { label: 'Setor', value: colab.setor || 'Manutenção' },
      { label: 'Status', value: 'APROVADA' },
      { label: 'Data da folga', value: pdf.formatDate(request.data_folga) },
      { label: 'Horas compensadas', value: pdf.formatMinutes(request.minutos_solicitados || folga.minutos_descontados || 0) },
      { label: 'Saldo antes', value: folga.saldo_antes_minutos !== undefined && folga.saldo_antes_minutos !== null ? pdf.formatMinutes(folga.saldo_antes_minutos) : '-' },
      { label: 'Saldo depois', value: folga.saldo_depois_minutos !== undefined && folga.saldo_depois_minutos !== null ? pdf.formatMinutes(folga.saldo_depois_minutos) : pdf.formatMinutes(saldoAtual.minutos || 0) },
    ], meta, { columns: 2 });

    pdf.sectionBand(doc, 'Origem das horas / serviço', meta);
    pdf.textBox(doc, originText(folga), meta, { fill: pdf.COLORS.greenSoft });

    pdf.sectionBand(doc, 'Solicitação e aprovação', meta);
    pdf.infoBox(doc, [
      { label: 'Solicitado em', value: request.solicitado_em ? String(request.solicitado_em).replace('T', ' ').slice(0, 16) : '-' },
      { label: 'Aprovado em', value: request.decidido_em ? String(request.decidido_em).replace('T', ' ').slice(0, 16) : '-' },
      { label: 'Aprovado por', value: request.decidido_por_nome || '-' },
      { label: 'Referência', value: `Solicitação #${request.id}${request.folga_id ? ` • Folga #${request.folga_id}` : ''}` },
    ], meta, { columns: 2 });
    pdf.textBox(doc, request.observacao_decisao || request.motivo || 'Sem observação adicional.', meta, { fill: pdf.COLORS.white });

    pdf.sectionBand(doc, 'Registro', meta);
    pdf.textBox(doc, 'Documento gerado a partir dos dados reais do RH, Escala e Banco de Horas. Quando não existe vínculo confiável entre a folga e uma OS/serviço específico, o documento informa “Origem não informada” e não cria associação artificial.', meta, { fontSize: 8.2, fill: pdf.COLORS.yellow, stroke: pdf.COLORS.yellowBorder });
    doc.end();
  });

  return doc;
}

function filterRequests(filters = {}) {
  const status = String(filters.status || 'APROVADA').toUpperCase();
  let rows = folgaSolicitacoes.listarSolicitacoes({ status: status || null, limit: 500 });
  if (filters.colaborador_id) rows = rows.filter((r) => Number(r.colaborador_id) === Number(filters.colaborador_id));
  const inicio = String(filters.inicio || '').slice(0, 10);
  const fim = String(filters.fim || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(inicio)) rows = rows.filter((r) => String(r.data_folga || '').slice(0, 10) >= inicio);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fim)) rows = rows.filter((r) => String(r.data_folga || '').slice(0, 10) <= fim);
  return rows;
}

function generateConsolidatedLeavePdf(filters = {}) {
  const rows = filterRequests(filters);
  const meta = {
    title: 'Relatório Consolidado de Folgas',
    subtitle: 'Campo do Gado • Manutenção Industrial • RH e Banco de Horas',
  };
  const doc = pdf.createDoc({ title: 'Relatório consolidado de folgas - RH' });

  process.nextTick(() => {
    pdf.setupPage(doc, meta);
    pdf.infoBox(doc, [
      { label: 'Período inicial', value: filters.inicio ? pdf.formatDate(filters.inicio) : 'Todos' },
      { label: 'Período final', value: filters.fim ? pdf.formatDate(filters.fim) : 'Todos' },
      { label: 'Status', value: String(filters.status || 'APROVADA').toUpperCase() },
      { label: 'Registros', value: String(rows.length) },
    ], meta, { columns: 2 });

    if (!rows.length) {
      pdf.sectionBand(doc, 'Resultado', meta);
      pdf.textBox(doc, 'Nenhuma folga encontrada para os filtros informados.', meta);
      doc.end();
      return;
    }

    const groups = new Map();
    rows.forEach((row) => {
      const key = Number(row.colaborador_id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    for (const [colaboradorId, leaves] of groups.entries()) {
      const colab = collaborator(colaboradorId) || {};
      const saldo = escala.calcularSaldoBancoHoras(colaboradorId);
      pdf.sectionBand(doc, colab.nome || leaves[0]?.colaborador_nome || `Colaborador #${colaboradorId}`, meta);
      drawProfile(doc, meta, colab);
      pdf.infoBox(doc, [
        { label: 'Função', value: colab.funcao || leaves[0]?.funcao || '-' },
        { label: 'Setor', value: colab.setor || 'Manutenção' },
        { label: 'Saldo atual', value: pdf.formatMinutes(saldo.minutos || 0) },
        { label: 'Folgas no relatório', value: String(leaves.length) },
      ], meta, { columns: 2 });

      leaves.forEach((request) => {
        const folga = leaveProgram(request.folga_id) || {};
        const line = [
          `${pdf.formatDate(request.data_folga)} • ${pdf.formatMinutes(request.minutos_solicitados || folga.minutos_descontados || 0)} • ${String(request.status || '-').toUpperCase()}`,
          originText(folga),
          request.motivo ? `Motivo/registro: ${request.motivo}` : '',
        ].filter(Boolean).join('\n');
        pdf.textBox(doc, line, meta, { fill: pdf.COLORS.white, fontSize: 8.5 });
      });
    }
    doc.end();
  });

  return doc;
}

module.exports = {
  getLeaveData,
  generateLeavePdf,
  generateConsolidatedLeavePdf,
};
