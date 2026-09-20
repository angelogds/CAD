const pcmService = require('../pcm/pcm.service');
const manutencaoExecutivaService = require('./diretoria.manutencao.service');
const pdfStandard = require('../../utils/pdf-standard');

const DIRETORIA_BASE_PATH = '/dashboard/diretoria';

function index(_req, res) {
  return res.redirect(301, '/dashboard');
}

function fallbackMaintenanceDashboard() {
  return {
    filtros: {},
    cards: {},
    graficos: {},
    tabelas: { ordens: [] },
    equipamentos_atencao: [],
    qualidade_dados: {
      score: null,
      status: 'SEM_DADOS',
      status_label: 'Sem dados suficientes',
      campos_pendentes: [],
    },
    custos: { totals: {}, byEquipment: [], byMonth: [] },
    confiabilidade: { status: 'SEM_DADOS', status_label: 'Dados insuficientes', publicado: false, byEquipment: [] },
    erros: ['Não foi possível carregar todos os indicadores da manutenção.'],
  };
}

function manutencao(req, res) {
  let dashboard;
  try {
    dashboard = manutencaoExecutivaService.getDashboard(req.query, req.session?.user?.id || null);
  } catch (error) {
    console.error('[diretoria] Falha ao abrir desempenho da manutenção:', error);
    dashboard = fallbackMaintenanceDashboard();
  }

  return res.render('pcm/dashboard-gerencial', {
    title: 'Desempenho da Manutenção',
    activeMenu: 'diretoria-manutencao',
    activePcmSection: '',
    opcoes: pcmService.listFiltros(),
    canManagePcm: false,
    dashboard,
    dashboardBasePath: `${DIRETORIA_BASE_PATH}/manutencao`,
    dashboardTitle: 'Desempenho da Manutenção',
    dashboardSubtitle: 'Indicadores executivos de manutenção para acompanhamento da Diretoria.',
    dashboardEyebrow: 'Operação · Desempenho da Manutenção',
    showPcmNav: false,
  });
}

function manutencaoDados(req, res) {
  try {
    const dashboard = manutencaoExecutivaService.getDashboard(req.query, req.session?.user?.id || null);
    return res.json({ ok: true, dashboard });
  } catch (error) {
    console.error('[diretoria] Falha ao atualizar indicadores executivos da manutenção:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Não foi possível atualizar os indicadores da manutenção.' });
  }
}

function dateBr(value) {
  const raw = String(value || '').slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (raw || '-');
}

function metric(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Dados insuficientes';
  return `${value}${suffix}`;
}

function moneyCents(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0) / 100);
}

function equipmentName(filters, options) {
  if (!filters?.equipamento_id) return 'Todos os equipamentos';
  const found = (options?.equipamentos || []).find((item) => Number(item.id) === Number(filters.equipamento_id));
  return found?.nome || `Equipamento #${filters.equipamento_id}`;
}

function manutencaoPdf(req, res, next) {
  try {
    const dashboard = manutencaoExecutivaService.getDashboard(req.query, req.session?.user?.id || null);
    const options = pcmService.listFiltros();
    const filtros = dashboard.filtros || {};
    const cards = dashboard.cards || {};
    const quality = dashboard.qualidade_dados || {};
    const reliability = dashboard.confiabilidade || {};
    const graphs = dashboard.graficos || {};
    const custos = dashboard.custos || { totals: {}, byEquipment: [], byMonth: [] };

    pcmService.logDashboardReport(req.session?.user?.id || null, 'PDF_DIRETORIA', filtros);

    const report = pdfStandard.createReport({
      title: 'Desempenho da Manutenção',
      subtitle: 'Indicadores executivos para acompanhamento da Diretoria',
      issuedAt: dateBr(new Date().toISOString().slice(0, 10)),
      sector: 'DIRETORIA / MANUTENÇÃO',
      headerContext: 'Desempenho da manutenção | Diretoria',
      footerText: 'Campo do Gado - Desempenho da Manutenção - Relatório executivo.',
      subject: 'Indicadores executivos de manutenção',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="desempenho-manutencao.pdf"');
    report.doc.pipe(res);

    process.nextTick(() => {
      try {
        report.start();
        report.identification([
          ['Período analisado', `${dateBr(filtros.data_inicial)} a ${dateBr(filtros.data_final)}`, 'Setor', filtros.setor || 'Todos os setores'],
          ['Equipamento', equipmentName(filtros, options), 'Situação da base', quality.status_label || 'Sem dados suficientes'],
          ['Origem dos dados', 'OS, PCM, Estoque, Solicitações e Compras', 'Emissão', dateBr(new Date().toISOString().slice(0, 10))],
        ]);

        report.summary([
          { label: 'OS NO PERÍODO', value: String(cards.total_os || 0) },
          { label: 'BACKLOG DE OS', value: String(cards.backlog_os_atual || 0) },
          { label: 'BACKLOG > 30 DIAS', value: String(cards.backlog_acima_30_dias || 0) },
          { label: 'CUMPRIMENTO DA PROGRAMAÇÃO', value: metric(cards.cumprimento_programacao, '%') },
        ]);

        report.table({
          title: 'Indicadores executivos',
          columns: [
            { key: 'indicador', label: 'Indicador', width: 170 },
            { key: 'valor', label: 'Valor', width: 95, align: 'center' },
            { key: 'leitura', label: 'Leitura executiva', width: 285 },
          ],
          rows: [
            { indicador: 'OS fora do SLA', valor: String(cards.os_atrasadas || 0), leitura: 'Ordens abertas há mais de 7 dias dentro dos critérios atuais do painel.' },
            { indicador: 'Tempo médio de conclusão', valor: metric(cards.tempo_medio_conclusao, ' h'), leitura: 'Tempo médio entre abertura e fechamento das OS concluídas com data válida.' },
            { indicador: 'Manutenção planejada', valor: metric(cards.percentual_manutencao_planejada, '%'), leitura: 'Participação das intervenções planejadas no período.' },
            { indicador: 'Reincidência corretiva', valor: metric(cards.reincidencia_corretiva_pct, '%'), leitura: 'Repetições de corretivas após a primeira ocorrência por equipamento no período.' },
            { indicador: 'Equipamentos reincidentes', valor: String(cards.equipamentos_reincidentes || 0), leitura: 'Equipamentos com duas ou mais corretivas no período.' },
            { indicador: 'Equipamentos críticos', valor: String(cards.equipamentos_criticos || 0), leitura: 'Ativos classificados em alta criticidade/crítica na base atual.' },
            { indicador: 'MTBF', valor: metric(cards.mtbf_horas, ' h'), leitura: reliability.publicado ? 'Tempo médio entre falhas calculado com eventos classificados e rastreáveis.' : 'Aguardando cobertura mínima de rastreabilidade.' },
            { indicador: 'MTTR', valor: metric(cards.mttr_horas, ' h'), leitura: reliability.publicado ? 'Tempo médio de reparo baseado nos intervalos reais de parada e retorno.' : 'Aguardando cobertura mínima de rastreabilidade.' },
            { indicador: 'Disponibilidade', valor: metric(cards.disponibilidade_pct, '%'), leitura: reliability.publicado ? 'Disponibilidade estimada pela relação MTBF / (MTBF + MTTR).' : 'Não publicada enquanto a base estiver incompleta.' },
            { indicador: 'Tempo total de parada', valor: metric(cards.tempo_parada_horas, ' h'), leitura: 'Somatório dos intervalos válidos de parada registrados no PCM.' },
            { indicador: 'Qualidade dos dados', valor: metric(cards.qualidade_dados_pct, '%'), leitura: quality.status_label || 'Base ainda em avaliação.' },
          ],
        });

        report.summary([
          { label: 'CONSUMIDO NA MANUTENÇÃO', value: moneyCents(cards.custo_consumido_centavos) },
          { label: 'COMPRADO NO PERÍODO', value: moneyCents(cards.custo_comprado_centavos) },
          { label: 'MATERIAIS RECEBIDOS', value: moneyCents(cards.custo_recebido_centavos) },
          { label: 'A RECEBER', value: moneyCents(cards.custo_pendente_recebimento_centavos) },
        ]);
        report.note('Custo real consumido considera somente baixas físicas do estoque vinculadas à manutenção. Comprado, recebido e a receber permanecem separados para não tratar estoque parado como custo já aplicado.');

        report.table({
          title: 'Custos por equipamento',
          columns: [
            { key: 'equipamento', label: 'Equipamento', width: 150 },
            { key: 'setor', label: 'Setor', width: 80 },
            { key: 'consumido', label: 'Consumido', width: 90, align: 'right' },
            { key: 'comprado', label: 'Comprado', width: 85, align: 'right' },
            { key: 'recebido', label: 'Recebido', width: 80, align: 'right' },
            { key: 'pendente', label: 'A receber', width: 75, align: 'right' },
          ],
          rows: (custos.byEquipment || []).slice(0, 15).map((item) => ({
            equipamento: item.equipamento_nome || '-',
            setor: item.setor || '-',
            consumido: moneyCents(item.consumido_centavos),
            comprado: moneyCents(item.comprado_centavos),
            recebido: moneyCents(item.recebido_centavos),
            pendente: moneyCents(item.pendente_centavos),
          })),
          emptyText: 'Nenhum custo de manutenção vinculado a equipamento no período selecionado.',
        });

        report.table({
          title: 'Evolução mensal dos custos',
          columns: [
            { key: 'mes', label: 'Mês', width: 120, align: 'center' },
            { key: 'consumido', label: 'Consumido', width: 145, align: 'right' },
            { key: 'comprado', label: 'Comprado', width: 145, align: 'right' },
            { key: 'recebido', label: 'Recebido', width: 145, align: 'right' },
          ],
          rows: (custos.byMonth || []).slice(-12).map((item) => ({
            mes: item.mes || '-',
            consumido: moneyCents(item.consumido_centavos),
            comprado: moneyCents(item.comprado_centavos),
            recebido: moneyCents(item.recebido_centavos),
          })),
          emptyText: 'Sem histórico mensal de custos para os filtros atuais.',
        });

        report.table({
          title: 'Backlog de OS por idade',
          columns: [
            { key: 'faixa', label: 'Faixa de idade', width: 210 },
            { key: 'total', label: 'OS pendentes', width: 110, align: 'center' },
            { key: 'observacao', label: 'Interpretação', width: 230 },
          ],
          rows: (graphs.backlog_idade || []).map((item) => ({
            faixa: item.faixa,
            total: String(item.total || 0),
            observacao: item.faixa === 'Acima de 60 dias' ? 'Backlog antigo que exige priorização e decisão.' : 'Pendências ainda abertas até a data final selecionada.',
          })),
          emptyText: 'Nenhuma OS pendente para os filtros atuais.',
        });

        report.table({
          title: 'Equipamentos com corretivas reincidentes',
          columns: [
            { key: 'equipamento', label: 'Equipamento', width: 185 },
            { key: 'setor', label: 'Setor', width: 105 },
            { key: 'corretivas', label: 'Corretivas', width: 75, align: 'center' },
            { key: 'repeticoes', label: 'Repetições', width: 75, align: 'center' },
            { key: 'criticidade', label: 'Criticidade', width: 90, align: 'center' },
          ],
          rows: (graphs.reincidencia_corretiva || []).slice(0, 12).map((item) => ({
            equipamento: item.nome || item.equipamento || '-',
            setor: item.setor || '-',
            corretivas: String(item.falhas || 0),
            repeticoes: String(item.repeticoes_apos_primeira || 0),
            criticidade: item.criticidade || '-',
          })),
          emptyText: 'Nenhum equipamento com duas ou mais corretivas no período.',
        });

        report.table({
          title: 'Qualidade dos dados para confiabilidade',
          columns: [
            { key: 'campo', label: 'Critério de rastreabilidade', width: 310 },
            { key: 'valor', label: 'Cobertura', width: 120, align: 'center' },
            { key: 'meta', label: 'Referência', width: 120, align: 'center' },
          ],
          rows: [
            { campo: 'OS com equipamento vinculado', valor: metric(quality.os_com_equipamento_pct, '%'), meta: '95% ou mais' },
            { campo: 'OS concluídas com data real de fechamento', valor: metric(quality.encerramento_com_data_pct, '%'), meta: '95% ou mais' },
            { campo: 'Corretivas classificadas no PCM', valor: metric(quality.corretivas_classificadas_pct, '%'), meta: '85% ou mais' },
            { campo: 'Corretivas com início e fim de parada', valor: metric(quality.paradas_com_intervalo_pct, '%'), meta: '85% ou mais' },
          ],
        });

        const pendencias = Array.isArray(quality.campos_pendentes) && quality.campos_pendentes.length
          ? quality.campos_pendentes.join('; ')
          : 'A base mínima avaliada atende aos critérios atuais.';
        report.note(reliability.publicado
          ? `Governança dos indicadores: ${pendencias}. MTBF, MTTR e disponibilidade estão liberados para o período com ${reliability.mtbf_amostras || 0} intervalo(s) entre falhas e ${reliability.mttr_amostras || 0} parada(s) válida(s).`
          : `Governança dos indicadores: ${pendencias}. MTBF, MTTR e disponibilidade permanecem como “dados insuficientes” até a cobertura mínima de rastreabilidade ser atendida.`);

        report.table({
          title: 'Confiabilidade por equipamento',
          columns: [
            { key: 'equipamento', label: 'Equipamento', width: 180 },
            { key: 'setor', label: 'Setor', width: 100 },
            { key: 'falhas', label: 'Falhas', width: 60, align: 'center' },
            { key: 'parada', label: 'Parada (h)', width: 75, align: 'right' },
            { key: 'mtbf', label: 'MTBF (h)', width: 75, align: 'right' },
            { key: 'mttr', label: 'MTTR (h)', width: 75, align: 'right' },
          ],
          rows: (reliability.byEquipment || []).slice(0, 15).map((item) => ({
            equipamento: item.equipamento_nome || '-',
            setor: item.setor || '-',
            falhas: String(item.falhas || 0),
            parada: metric(item.tempo_parada_horas),
            mtbf: metric(item.mtbf_horas),
            mttr: metric(item.mttr_horas),
          })),
          emptyText: 'Sem falhas classificadas suficientes para detalhar confiabilidade.',
        });

        report.table({
          title: 'Equipamentos que exigem atenção',
          columns: [
            { key: 'equipamento', label: 'Equipamento', width: 180 },
            { key: 'setor', label: 'Setor', width: 100 },
            { key: 'falhas', label: 'Falhas', width: 60, align: 'center' },
            { key: 'criticidade', label: 'Criticidade', width: 80, align: 'center' },
            { key: 'motivo', label: 'Motivo da atenção', width: 130 },
          ],
          rows: (dashboard.equipamentos_atencao || []).slice(0, 12).map((item) => ({
            equipamento: item.nome || item.equipamento || '-',
            setor: item.setor || '-',
            falhas: String(item.falhas || 0),
            criticidade: item.criticidade || '-',
            motivo: (item.motivos || []).join('; ') || 'Necessita avaliação técnica.',
          })),
          emptyText: 'Nenhum equipamento excedeu os limites atuais de atenção.',
        });

        report.end();
      } catch (error) {
        report.doc.destroy(error);
      }
    });

    return report.doc;
  } catch (error) {
    return next(error);
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function tableHtml(title, rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const keys = list.length ? Object.keys(list[0]).filter((key) => !key.startsWith('_')) : [];
  if (!keys.length) return `<h2>${escapeHtml(title)}</h2><p>Sem dados.</p>`;
  const head = keys.map((key) => `<th>${escapeHtml(key)}</th>`).join('');
  const body = list.map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(row[key])}</td>`).join('')}</tr>`).join('');
  return `<h2>${escapeHtml(title)}</h2><table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function manutencaoExcel(req, res) {
  const data = manutencaoExecutivaService.getDashboard(req.query, req.session?.user?.id || null);
  pcmService.logDashboardReport(req.session?.user?.id || null, 'EXCEL_DIRETORIA', data.filtros);
  const reliabilitySummary = { ...(data.confiabilidade || {}) };
  delete reliabilitySummary.byEquipment;
  const sheets = [
    tableHtml('Resumo', [data.cards || {}]),
    tableHtml('Confiabilidade', [reliabilitySummary]),
    tableHtml('Confiabilidade por equipamento', data.confiabilidade?.byEquipment || []),
    tableHtml('Custos por equipamento', data.custos?.byEquipment || []),
    tableHtml('Custos por mês', data.custos?.byMonth || []),
    tableHtml('Ordens de serviço', data.tabelas?.ordens || []),
    tableHtml('Equipamentos que exigem atenção', data.equipamentos_atencao || []),
  ];
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="desempenho-manutencao.xls"');
  return res.send(`<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th{background:#166534;color:#fff}td,th{padding:5px}</style></head><body>${sheets.join('<br style="page-break-after:always">')}</body></html>`);
}

module.exports = { index, manutencao, manutencaoDados, manutencaoPdf, manutencaoExcel, DIRETORIA_BASE_PATH };
