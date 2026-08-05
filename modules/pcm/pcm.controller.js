const service = require("./pcm.service");
const PDFDocument = require("pdfkit");

function baseView(req) {
  return {
    title: "PCM – Planejamento e Controle da Manutenção",
    activeMenu: "pcm",
    opcoes: service.listFiltros(),
  };
}

function index(req, res) {
  let automacaoResumo = { geradas: 0, riscosAltos: 0 };
  try {
    automacaoResumo = service.processarAutomacaoOS({ userId: req.session?.user?.id || null });
  } catch (_e) {}

  let riscos = [];
  let rankingTecnicos = [];
  let alertasOperacionais = [];
  try { riscos = service.atualizarScoresRiscoEquipamentos().slice(0, 8); } catch (_e) {}
  try { rankingTecnicos = service.getRankingTecnicos({ dias: Number(req.query.dias || 90), setor: req.query.setor || "" }).slice(0, 10); } catch (_e) {}
  try { alertasOperacionais = service.listarAlertasOperacionais({ limit: 8 }); } catch (_e) {}

  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    setor: req.query.setor || "",
    tipo_manutencao: req.query.tipo_manutencao || "",
  };

  return res.render("pcm/index", {
    ...baseView(req),
    activePcmSection: "visao-geral",
    indicadores: service.getIndicadores(),
    ranking: service.getRankingEquipamentos(5, Number(req.query.meses || 6)),
    rankingTecnicos,
    riscos,
    alertasOperacionais,
    automacaoResumo,
    planos: service.listPlanos(filtros),
    filtros,
  });
}

function planejamento(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    setor: req.query.setor || "",
    tipo_manutencao: req.query.tipo_manutencao || "",
  };
  return res.render("pcm/planejamento", {
    ...baseView(req),
    activePcmSection: "planejamento",
    planos: service.listPlanos(filtros),
    filtros,
  });
}

function falhas(req, res) {
  const filtros = {
    periodo: req.query.periodo || "",
    equipamento: req.query.equipamento || "",
    tipo_falha: req.query.tipo_falha || "",
  };
  return res.render("pcm/falhas", {
    ...baseView(req),
    activePcmSection: "falhas",
    filtros,
    falhas: service.listOSFalhasPreview(),
    equipamentos: service.getEquipamentos(),
  });
}

function engenharia(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    categoria: req.query.categoria || "",
    busca: req.query.busca || "",
  };
  return res.render("pcm/engenharia", {
    ...baseView(req),
    activePcmSection: "engenharia",
    filtros,
    equipamentos: service.getEquipamentos(),
    equipamentoSelecionado: service.getEquipamentoById(filtros.equipamento_id),
    bom: service.listBom(filtros),
  });
}

function criticidade(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
  };
  const criticidadeAtual = service.getCriticidadeByEquipamentoId(filtros.equipamento_id);
  return res.render("pcm/criticidade", {
    ...baseView(req),
    activePcmSection: "criticidade",
    filtros,
    equipamentos: service.getEquipamentos(),
    criticidadeAtual,
  });
}

function salvarCriticidade(req, res) {
  try {
    const data = service.saveCriticidade(req.body, req.session?.user?.id || null);
    req.flash(
      "success",
      `Criticidade do equipamento atualizada para ${data.nivel_criticidade} (índice ${data.indice_criticidade.toFixed(1)}).`
    );
  } catch (e) {
    req.flash("error", e.message || "Falha ao salvar criticidade do equipamento.");
  }
  return res.redirect(`/pcm/criticidade?equipamento_id=${encodeURIComponent(req.body.equipamento_id || "")}`);
}

function lubrificacao(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    setor: req.query.setor || "",
  };
  const sugestaoIA = req.session?.pcmLubrificacaoSugestao || null;
  if (req.session) req.session.pcmLubrificacaoSugestao = null;
  return res.render("pcm/lubrificacao", {
    ...baseView(req),
    activePcmSection: "lubrificacao",
    filtros,
    equipamentos: service.getEquipamentos(),
    lubrificacoes: service.listLubrificacao(filtros),
    sugestaoIA,
  });
}

function pecasCriticas(req, res) {
  const filtros = {
    tipo: req.query.tipo || "",
    busca: req.query.busca || "",
    abaixo_minimo: req.query.abaixo_minimo || "",
  };
  return res.render("pcm/pecas-criticas", {
    ...baseView(req),
    activePcmSection: "pecas-criticas",
    filtros,
    pecas: service.listPecasCriticas(filtros),
  });
}

function programacaoSemanal(req, res) {
  const filtros = {
    semana: req.query.semana || "",
    responsavel: req.query.responsavel || "",
    tipo: req.query.tipo || "",
    setor: req.query.setor || "",
    criticidade: req.query.criticidade || "",
  };

  const atividadesSemProgramacao = service.listBacklogSimples().slice(0, 12).map((b) => ({
    id: b.id,
    equipamento: b.equipamento,
    tipo: b.tipo,
    horas: 2,
    criticidade: b.criticidade || "N/D",
  }));

  const semanaGrid = ["Mecânico 1", "Mecânico 2", "Eletricista", "Equipe A"].map((responsavel, idx) => ({
    responsavel,
    dias: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      itens: atividadesSemProgramacao.filter((_, i) => (i + idx + d) % 11 === 0).slice(0, 2),
    })),
  }));

  return res.render("pcm/programacao-semanal", {
    ...baseView(req),
    activePcmSection: "programacao-semanal",
    filtros,
    semanaGrid,
    atividadesSemProgramacao,
  });
}

function backlog(req, res) {
  const filtros = {
    tipo: req.query.tipo || "",
    setor: req.query.setor || "",
    criticidade: req.query.criticidade || "",
    prioridade: req.query.prioridade || "",
    dias_atraso: req.query.dias_atraso || "",
  };

  let items = service.listBacklogSimples().map((b) => ({
    tipo: b.tipo,
    numero: b.numero,
    equipamento: b.equipamento,
    criticidade: b.criticidade,
    prioridade: b.prioridade,
    data_ref: b.data_ref,
    atraso: b.atraso,
    status: b.status,
    setor: b.setor || "",
  }));

  if (filtros.tipo) items = items.filter((i) => String(i.tipo).includes(filtros.tipo.toUpperCase()));
  if (filtros.criticidade) items = items.filter((i) => String(i.criticidade).includes(filtros.criticidade.toUpperCase()));
  if (filtros.prioridade) items = items.filter((i) => String(i.prioridade).includes(filtros.prioridade.toUpperCase()));
  if (filtros.dias_atraso) items = items.filter((i) => Number(i.atraso || 0) >= Number(filtros.dias_atraso));

  return res.render("pcm/backlog", {
    ...baseView(req),
    activePcmSection: "backlog",
    filtros,
    backlog: items,
  });
}

function rotasInspecao(req, res) {
  return res.render("pcm/rotas-inspecao", {
    ...baseView(req),
    activePcmSection: "rotas-inspecao",
    rotas: service.listRotasInspecao(),
    equipamentos: service.getEquipamentos(),
  });
}

function relatoriosAvancados(req, res) {
  const indicadores = service.getIndicadores();
  const filtros = {
    periodo_inicio: req.query.periodo_inicio || "",
    periodo_fim: req.query.periodo_fim || "",
    setor: req.query.setor || "",
  };
  return res.render("pcm/relatorios-avancados", {
    ...baseView(req),
    activePcmSection: "relatorios-avancados",
    filtros,
    ranking: service.getRankingEquipamentos(10, Number(req.query.meses || 6)),
    resumo: {
      custo_total: Number(indicadores.custo_manutencao_mes || 0).toFixed(2),
      falhas: indicadores.corretiva_qtd_mes || 0,
      pct_preventiva: indicadores.preventiva_pct_mes || 0,
      pct_corretiva: indicadores.corretiva_pct_mes || 0,
    },
  });
}

function createPlano(req, res) {
  try {
    const id = service.createPlano({
      equipamento_id: req.body.equipamento_id,
      atividade_descricao: req.body.atividade_descricao,
      tipo_manutencao: req.body.tipo_manutencao,
      frequencia_dias: req.body.frequencia_dias,
      frequencia_horas: req.body.frequencia_horas,
      proxima_data_prevista: req.body.proxima_data_prevista,
      observacao: req.body.observacao,
      created_by: req.session?.user?.id || null,
    });
    req.flash("success", `Plano mestre #${id} criado com sucesso.`);
  } catch (e) {
    req.flash("error", e.message || "Erro ao criar plano mestre.");
  }
  return res.redirect("/pcm/planejamento");
}

function gerarOS(req, res) {
  try {
    const osId = service.gerarOS(req.params.id, req.session?.user?.id || null);
    req.flash("success", `OS preventiva #${osId} gerada automaticamente.`);
  } catch (e) {
    req.flash("error", e.message || "Erro ao gerar OS do plano.");
  }
  return res.redirect("/pcm/planejamento");
}

function registrarExecucao(req, res) {
  try {
    const osId = service.registrarExecucao(req.params.id, req.session?.user?.id || null);
    req.flash("success", `Execução registrada com vínculo na OS #${osId}.`);
  } catch (e) {
    req.flash("error", e.message || "Erro ao registrar execução.");
  }
  return res.redirect("/pcm/planejamento");
}


function atualizarIndicadores(_req, res) {
  return res.redirect('/pcm');
}

function registrarFalha(req, res) {
  try {
    const osId = service.createFalhaOS(req.body, req.session?.user?.id || null);
    req.flash('success', `Falha registrada e OS corretiva #${osId} aberta com sucesso.`);
  } catch (e) {
    req.flash('error', e.message || 'Falha ao registrar ocorrência.');
  }
  return res.redirect('/pcm/falhas');
}

function adicionarComponente(req, res) {
  try {
    const itemId = service.addComponenteBOM(req.body, req.session?.user?.id || null);
    req.flash('success', `Componente adicionado à engenharia/BOM (item #${itemId}).`);
  } catch (e) {
    req.flash('error', e.message || 'Falha ao adicionar componente.');
  }
  const eid = encodeURIComponent(req.body.equipamento_id || '');
  return res.redirect(`/pcm/engenharia?equipamento_id=${eid}`);
}

function adicionarLubrificacao(req, res) {
  try {
    const id = service.addPontoLubrificacao(req.body, req.session?.user?.id || null);
    req.flash('success', `Ponto de lubrificação #${id} cadastrado com sucesso.`);
  } catch (e) {
    req.flash('error', e.message || 'Falha ao cadastrar ponto de lubrificação.');
  }
  const eid = encodeURIComponent(req.body.equipamento_id || '');
  return res.redirect(`/pcm/lubrificacao?equipamento_id=${eid}`);
}

function sugerirPlanoLubrificacaoIA(req, res) {
  try {
    const sugestao = service.gerarSugestaoPlanoLubrificacao(req.body.equipamento_id || req.query.equipamento_id);
    if (req.session) req.session.pcmLubrificacaoSugestao = sugestao;
    req.flash("success", `Sugestão de IA gerada para ${sugestao.equipamento_nome}.`);
  } catch (e) {
    req.flash("error", e.message || "Falha ao gerar sugestão de lubrificação.");
  }
  const eid = encodeURIComponent(req.body.equipamento_id || req.query.equipamento_id || "");
  return res.redirect(`/pcm/lubrificacao?equipamento_id=${eid}`);
}

function aplicarSugestaoLubrificacaoIA(req, res) {
  try {
    const sugestao = req.session?.pcmLubrificacaoSugestao || null;
    const ids = service.aplicarSugestaoPlanoLubrificacao(sugestao, req.session?.user?.id || null);
    req.flash("success", `IA aplicou ${ids.length} ponto(s) de lubrificação automaticamente. Você pode editar/corrigir na sequência.`);
    if (req.session) req.session.pcmLubrificacaoSugestao = null;
  } catch (e) {
    req.flash("error", e.message || "Falha ao aplicar sugestão automática de lubrificação.");
  }
  const eid = encodeURIComponent(req.body.equipamento_id || "");
  return res.redirect(`/pcm/lubrificacao?equipamento_id=${eid}`);
}

function salvarProgramacao(req, res) {
  // TODO: persistir programação semanal em pcm_programacao_semana/itens
  req.flash('success', 'Programação da semana salva (integração pendente).');
  return res.redirect('/pcm/programacao-semanal');
}

function programarBacklog(req, res) {
  // TODO: mover item backlog para programação semanal
  req.flash('success', `Item ${req.params.id} enviado para programação (integração pendente).`);
  return res.redirect('/pcm/programacao-semanal');
}

function novaRota(req, res) {
  try {
    const id = service.createRotaInspecaoRapida(req.body, req.session?.user?.id || null);
    req.flash('success', `Rota de inspeção #${id} criada com sucesso.`);
  } catch (e) {
    req.flash('error', e.message || 'Falha ao criar rota.');
  }
  return res.redirect('/pcm/rotas-inspecao');
}

function salvarExecucaoRota(req, res) {
  try {
    const out = service.registrarExecucaoRota(req.body, req.session?.user?.id || null);
    if (out.osId) {
      req.flash('success', `Execução da rota "${out.rota}" salva e OS #${out.osId} gerada.`);
    } else {
      req.flash('success', `Execução da rota "${out.rota}" salva com sucesso.`);
    }
  } catch (e) {
    req.flash('error', e.message || 'Falha ao salvar execução da rota.');
  }
  return res.redirect('/pcm/rotas-inspecao');
}



function dashboardGerencial(req, res) {
  let data;
  try {
    data = service.getDashboardGerencial(req.query, req.session?.user?.id || null);
  } catch (e) {
    console.error('[PCM Dashboard] Falha ao abrir dashboard gerencial:', e);
    const hoje = new Date().toISOString().slice(0, 10);
    data = { filtros: { data_inicial: hoje, data_final: hoje }, prefs: { cards: service.DASHBOARD_DEFAULT_CARDS }, cards: {}, graficos: {}, tabelas: { ordens: [] }, equipamentos_atencao: [], opcoesExtras: { mecanicos: [], status: [], tipos: [], criticidades: [] }, erros: ['Falha ao carregar indicadores. A equipe técnica já recebeu o erro no log do servidor.'] };
  }
  return res.render("pcm/dashboard-gerencial", {
    ...baseView(req),
    title: "Dashboard Gerencial de Manutenção – PCM",
    activePcmSection: "dashboard-gerencial",
    dashboard: data,
  });
}

function dashboardConfig(req, res) {
  const prefs = service.getDashboardPreferences(req.session?.user?.id || null);
  return res.render("pcm/dashboard-config", {
    ...baseView(req),
    title: "Configurar dashboard",
    activePcmSection: "dashboard-gerencial",
    prefs,
    cardsDisponiveis: service.DASHBOARD_DEFAULT_CARDS,
    graficosDisponiveis: service.DASHBOARD_DEFAULT_GRAFICOS,
  });
}

function salvarDashboardConfig(req, res) {
  const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  service.saveDashboardPreferences(req.session?.user?.id || null, {
    cards: arr(req.body.cards),
    graficos: arr(req.body.graficos),
    periodo_padrao: req.body.periodo_padrao || 'mes_atual',
    limites: {
      falhas_periodo: Number(req.body.falhas_periodo || 3),
      dias_preventiva_atraso: Number(req.body.dias_preventiva_atraso || 1),
      horas_parada: Number(req.body.horas_parada || 24),
    },
  });
  req.flash('success', 'Preferências do dashboard salvas.');
  return res.redirect('/pcm/dashboard-gerencial');
}

function resetDashboardConfig(req, res) {
  service.saveDashboardPreferences(req.session?.user?.id || null, { cards: service.DASHBOARD_DEFAULT_CARDS, graficos: service.DASHBOARD_DEFAULT_GRAFICOS, periodo_padrao: 'mes_atual', limites: {} });
  req.flash('success', 'Preferências padrão restauradas.');
  return res.redirect('/pcm/dashboard-gerencial/configurar');
}

function dashboardPdf(req, res) {
  const data = service.getDashboardGerencial(req.query, req.session?.user?.id || null);
  service.logDashboardReport(req.session?.user?.id || null, 'PDF', data.filtros);
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="relatorio-gerencial-pcm.pdf"');
  doc.pipe(res);
  doc.fillColor('#166534').fontSize(16).text('Campo do Gado', { align: 'center' });
  doc.fillColor('#111827').fontSize(14).text('Dashboard Gerencial de Manutenção – PCM', { align: 'center' });
  doc.moveDown().fontSize(9).text(`Período: ${data.filtros.data_inicial} a ${data.filtros.data_final}`);
  doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')} por ${req.session?.user?.name || req.session?.user?.email || 'Usuário'}`);
  doc.text('Rodapé institucional: Sistema Manutenção Campo do Gado V2 • PCM');
  doc.moveDown().fontSize(12).fillColor('#166534').text('Indicadores principais');
  doc.fillColor('#111827').fontSize(9);
  Object.entries(data.cards).forEach(([k,v]) => doc.text(`${k}: ${v ?? 'sem dado registrado'}`));
  doc.moveDown().fontSize(12).fillColor('#166534').text('Equipamentos que exigem atenção');
  doc.fillColor('#111827').fontSize(9);
  if (!data.equipamentos_atencao.length) doc.text('Sem equipamentos sinalizados pelos limites atuais.');
  data.equipamentos_atencao.slice(0, 20).forEach((e) => doc.text(`${e.codigo || '-'} ${e.nome} • ${e.setor || '-'} • ${e.motivos.join('; ')}`));
  doc.moveDown().fontSize(12).fillColor('#166534').text('Rankings');
  doc.fillColor('#111827').fontSize(9).text(`Falhas por equipamento: ${data.graficos.falhas_equipamento.length} linhas`);
  doc.text(`Ranking de solicitantes: ${data.graficos.ranking_solicitantes.length} linhas`);
  doc.text(`Ranking operacional de mecânicos: ${data.graficos.ranking_mecanicos.length} linhas`);
  doc.end();
}

function esc(v) { return String(v ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function tableHtml(title, rows) { const keys = rows[0] ? Object.keys(rows[0]) : ['mensagem']; const body = rows.length ? rows : [{ mensagem: 'Sem dados' }]; return `<h2>${esc(title)}</h2><table border="1"><tr>${keys.map(k=>`<th>${esc(k)}</th>`).join('')}</tr>${body.map(r=>`<tr>${keys.map(k=>`<td>${esc(r[k])}</td>`).join('')}</tr>`).join('')}</table>`; }
function dashboardExcel(req, res) {
  const data = service.getDashboardGerencial(req.query, req.session?.user?.id || null);
  service.logDashboardReport(req.session?.user?.id || null, 'EXCEL', data.filtros);
  const sheets = [
    tableHtml('Resumo', [data.cards]), tableHtml('Ordens de serviço', data.tabelas.ordens), tableHtml('Equipamentos', data.tabelas.equipamentos), tableHtml('Preventivas', data.tabelas.preventivas), tableHtml('Falhas por equipamento', data.graficos.falhas_equipamento), tableHtml('Ranking dos mecânicos', data.graficos.ranking_mecanicos), tableHtml('Ranking dos solicitantes', data.graficos.ranking_solicitantes), tableHtml('Equipamentos que exigem atenção', data.equipamentos_atencao)
  ];
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="dashboard-gerencial-pcm.xls"');
  return res.send(`<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th{background:#166534;color:#fff}</style></head><body>${sheets.join('<br style="page-break-after:always">')}</body></html>`);
}

module.exports = {
  index,
  dashboardGerencial,
  dashboardConfig,
  salvarDashboardConfig,
  resetDashboardConfig,
  dashboardPdf,
  dashboardExcel,
  planejamento,
  falhas,
  engenharia,
  criticidade,
  salvarCriticidade,
  lubrificacao,
  pecasCriticas,
  programacaoSemanal,
  backlog,
  rotasInspecao,
  relatoriosAvancados,
  atualizarIndicadores,
  registrarFalha,
  adicionarComponente,
  adicionarLubrificacao,
  sugerirPlanoLubrificacaoIA,
  aplicarSugestaoLubrificacaoIA,
  salvarProgramacao,
  programarBacklog,
  novaRota,
  salvarExecucaoRota,
  createPlano,
  gerarOS,
  registrarExecucao,
};
