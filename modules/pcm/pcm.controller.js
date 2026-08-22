const service = require("./pcm.service");
const operationalService = require("./pcm.operational.service");
const PDFDocument = require("pdfkit");
const { canAccessModule } = require("../../config/rbac");

function baseView(req) {
  const role = req.session?.user?.role || "";
  return {
    title: "PCM – Planejamento e Controle da Manutenção",
    activeMenu: "pcm",
    opcoes: service.listFiltros(),
    canManagePcm: canAccessModule(role, "pcm_manage"),
  };
}

function countBy(rows, predicate) {
  return (rows || []).reduce((total, row) => total + (predicate(row) ? 1 : 0), 0);
}

function planningSummary(planos = []) {
  return {
    total: planos.length,
    atrasados: countBy(planos, (item) => item.situacao === "ATRASADO"),
    proximos: countBy(planos, (item) => item.situacao === "PROXIMO_VENCIMENTO"),
    sem_data: countBy(planos, (item) => !item.proxima_data_prevista),
  };
}

function failureSummary(falhas = []) {
  return {
    total: falhas.length,
    criticas: countBy(falhas, (item) => ["CRITICA", "CRÍTICA", "ALTA"].includes(String(item.prioridade || "").toUpperCase())),
    sem_classificacao: countBy(falhas, (item) => !Number(item.classificada)),
    equipamentos: new Set(falhas.map((item) => Number(item.equipamento_id)).filter(Boolean)).size,
  };
}

function lubricationSummary(planos = [], totalEquipamentos = 0) {
  const cobertos = new Set(planos.map((item) => Number(item.equipamento_id)).filter(Boolean)).size;
  return {
    pontos: planos.length,
    atrasados: countBy(planos, (item) => item.situacao === "ATRASADO"),
    em_breve: countBy(planos, (item) => item.situacao === "EM_BREVE"),
    cobertura: totalEquipamentos ? Math.round((cobertos * 1000) / totalEquipamentos) / 10 : 0,
  };
}

function partsSummary(pecas = []) {
  return {
    total: pecas.length,
    abaixo_minimo: countBy(pecas, (item) => Number(item.estoque_atual || 0) < Number(item.estoque_minimo || 0)),
    zeradas: countBy(pecas, (item) => Number(item.estoque_atual || 0) <= 0),
    sem_vinculo: countBy(pecas, (item) => !item.estoque_item_id),
  };
}

function index(req, res) {
  let painel;
  try {
    painel = operationalService.getOverview(req.query, req.session?.user?.id || null);
  } catch (error) {
    console.error('[PCM] Falha ao montar visão operacional:', error);
    painel = {
      filtros: operationalService.resolveFilters(req.query), cards: {}, fila: [], riscos: [],
      planos: [], alertas: [], distribuicao_status: [], preventivas: {}, analise_ia: null,
      atualizado_em: new Date().toISOString(), erro: 'Não foi possível carregar todos os indicadores.',
    };
  }

  return res.render("pcm/index", {
    ...baseView(req),
    activePcmSection: "visao-geral",
    painel,
  });
}

function planejamento(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    setor: req.query.setor || "",
    tipo_manutencao: req.query.tipo_manutencao || "",
  };
  const planos = service.listPlanos(filtros);
  return res.render("pcm/planejamento", {
    ...baseView(req),
    activePcmSection: "planejamento",
    planos,
    resumo: planningSummary(planos),
    filtros,
  });
}

function falhas(req, res) {
  const filtros = {
    periodo: req.query.periodo || "",
    equipamento: req.query.equipamento || "",
    tipo_falha: req.query.tipo_falha || "",
  };
  const falhasEncontradas = service.listOSFalhasPreview(filtros);
  return res.render("pcm/falhas", {
    ...baseView(req),
    activePcmSection: "falhas",
    filtros,
    falhas: falhasEncontradas,
    resumo: failureSummary(falhasEncontradas),
    equipamentos: service.getEquipamentos(),
  });
}

function engenharia(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    categoria: req.query.categoria || "",
    busca: req.query.busca || "",
  };
  const bom = service.listBom(filtros);
  const criticidadeAtual = service.getCriticidadeByEquipamentoId(filtros.equipamento_id);
  return res.render("pcm/engenharia", {
    ...baseView(req),
    activePcmSection: "engenharia",
    filtros,
    equipamentos: service.getEquipamentos(),
    equipamentoSelecionado: service.getEquipamentoById(filtros.equipamento_id),
    criticidadeAtual,
    bom,
    resumo: {
      componentes: bom.length,
      criticos: countBy(bom, (item) => Number(item.peca_critica) === 1),
      vinculados_estoque: countBy(bom, (item) => Boolean(item.estoque_item_id)),
      indice_criticidade: criticidadeAtual?.indice_criticidade ?? null,
    },
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
  return res.redirect(`/pcm/engenharia?equipamento_id=${encodeURIComponent(req.body.equipamento_id || "")}#criticidade`);
}

function lubrificacao(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    setor: req.query.setor || "",
  };
  const sugestaoIA = req.session?.pcmLubrificacaoSugestao || null;
  if (req.session) req.session.pcmLubrificacaoSugestao = null;
  const equipamentos = service.getEquipamentos();
  const lubrificacoes = service.listLubrificacao(filtros);
  return res.render("pcm/lubrificacao", {
    ...baseView(req),
    activePcmSection: "lubrificacao",
    filtros,
    equipamentos,
    lubrificacoes,
    resumo: lubricationSummary(lubrificacoes, equipamentos.length),
    sugestaoIA,
  });
}

function pecasCriticas(req, res) {
  const filtros = {
    tipo: req.query.tipo || "",
    busca: req.query.busca || "",
    abaixo_minimo: req.query.abaixo_minimo || "",
  };
  const pecas = service.listPecasCriticas(filtros);
  return res.render("pcm/pecas-criticas", {
    ...baseView(req),
    activePcmSection: "pecas-criticas",
    filtros,
    pecas,
    resumo: partsSummary(pecas),
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

  const programacao = operationalService.getWeeklySchedule({ semana_inicio: filtros.semana || req.query.semana_inicio });
  const programadas = new Set(programacao.itens.map((item) => Number(item.os_id)));
  const atividadesSemProgramacao = service.listBacklogSimples().filter((b) => !programadas.has(Number(b.id))).slice(0, 20).map((b) => ({
    id: b.id,
    equipamento: b.equipamento,
    tipo: b.tipo,
    horas: 2,
    criticidade: b.criticidade || "N/D",
    prioridade: b.prioridade || 'MEDIA',
    status: b.status || 'ABERTA',
  }));

  return res.render("pcm/programacao-semanal", {
    ...baseView(req),
    activePcmSection: "programacao-semanal",
    filtros,
    programacao,
    atividadesSemProgramacao,
    resumo: {
      total: programacao.itens.length,
      horas: programacao.itens.reduce((sum, item) => sum + Number(item.horas_estimadas || 0), 0),
      sem_responsavel: countBy(programacao.itens, (item) => !item.responsavel_user_id),
      pendentes: atividadesSemProgramacao.length,
    },
  });
}

function relatoriosAvancados(req, res) {
  const filtros = {
    data_inicial: req.query.data_inicial || "",
    data_final: req.query.data_final || "",
    setor: req.query.setor || "",
    equipamento_id: req.query.equipamento_id || "",
  };
  const dashboard = service.getDashboardGerencial({ periodo: 'ultimos_6_meses', ...filtros }, req.session?.user?.id || null);
  return res.render("pcm/relatorios-avancados", {
    ...baseView(req),
    activePcmSection: "relatorios-avancados",
    filtros: dashboard.filtros,
    relatorio: dashboard,
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


function atualizarIndicadores(req, res) {
  try {
    const riscos = service.atualizarScoresRiscoEquipamentos();
    const result = { equipamentos_processados: riscos.length, riscos_altos: riscos.filter((item) => item.classificacao_risco === 'ALTO').length };
    operationalService.logOperationalCycle('ATUALIZAR_INDICADORES', req.session?.user?.id || null, result);
    req.flash('success', `Indicadores atualizados: ${result.equipamentos_processados} equipamento(s) processado(s).`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível atualizar os indicadores do PCM.');
  }
  return res.redirect(`/pcm?${new URLSearchParams(req.body || {}).toString()}`);
}

function executarAutomacao(req, res) {
  try {
    const result = service.processarAutomacaoOS({ userId: req.session?.user?.id || null });
    operationalService.logOperationalCycle('EXECUTAR_AUTOMACAO', req.session?.user?.id || null, result);
    req.flash('success', `Ciclo concluído: ${result.geradas || 0} OS automática(s) gerada(s) e ${result.riscosAltos || 0} risco(s) alto(s) revisado(s).`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível executar o ciclo automático.');
  }
  return res.redirect(`/pcm?${new URLSearchParams(req.body || {}).toString()}`);
}

async function analisarIA(req, res) {
  try {
    const result = await operationalService.generateAIAnalysis(req.body || {}, req.session?.user?.id || null);
    const origem = result.origem === 'OPENAI' ? 'OpenAI' : 'análise local de contingência';
    req.flash('success', `Análise do PCM atualizada com ${origem}.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível gerar a análise do PCM.');
  }
  return res.redirect(`/pcm?${new URLSearchParams(req.body || {}).toString()}`);
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

function classificarFalha(req, res) {
  try {
    service.classificarFalhaOS(req.params.osId, req.body, req.session?.user?.id || null);
    req.flash('success', `Classificação técnica da OS #${req.params.osId} salva com sucesso.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível classificar a falha.');
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

async function sugerirPlanoLubrificacaoIA(req, res) {
  try {
    const sugestao = await service.gerarSugestaoPlanoLubrificacao(req.body.equipamento_id || req.query.equipamento_id);
    if (req.session) req.session.pcmLubrificacaoSugestao = sugestao;
    const origem = sugestao.origem === 'OPENAI' ? 'OpenAI' : 'modelo local de contingência';
    req.flash("success", `Rascunho de lubrificação gerado com ${origem} para ${sugestao.equipamento_nome}. Revise antes de aplicar.`);
  } catch (e) {
    req.flash("error", e.message || "Falha ao gerar sugestão de lubrificação.");
  }
  const eid = encodeURIComponent(req.body.equipamento_id || req.query.equipamento_id || "");
  return res.redirect(`/pcm/lubrificacao?equipamento_id=${eid}`);
}

function aplicarSugestaoLubrificacaoIA(req, res) {
  try {
    if (String(req.body.confirmacao_tecnica || '') !== '1') {
      throw new Error('Confirme a revisão técnica do rascunho antes de cadastrar os pontos.');
    }
    const sugestao = req.session?.pcmLubrificacaoSugestao || null;
    const ids = service.aplicarSugestaoPlanoLubrificacao(sugestao, req.session?.user?.id || null);
    req.flash("success", `${ids.length} ponto(s) de lubrificação cadastrado(s) após confirmação técnica.`);
    if (req.session) req.session.pcmLubrificacaoSugestao = null;
  } catch (e) {
    req.flash("error", e.message || "Falha ao aplicar sugestão automática de lubrificação.");
  }
  const eid = encodeURIComponent(req.body.equipamento_id || "");
  return res.redirect(`/pcm/lubrificacao?equipamento_id=${eid}`);
}

function salvarProgramacao(req, res) {
  try {
    operationalService.scheduleBacklogItem(req.body.os_id, req.body, req.session?.user?.id || null);
    req.flash('success', `OS #${req.body.os_id} programada com sucesso.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível salvar a programação.');
  }
  const week = encodeURIComponent(req.body.semana_inicio || '');
  return res.redirect(`/pcm/programacao-semanal${week ? `?semana_inicio=${week}` : ''}`);
}

function programarBacklog(req, res) {
  try {
    operationalService.scheduleBacklogItem(req.params.id, req.body, req.session?.user?.id || null);
    req.flash('success', `OS #${req.params.id} incluída na programação semanal.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível programar a OS.');
  }
  const week = encodeURIComponent(req.body.semana_inicio || '');
  return res.redirect(`/pcm/programacao-semanal${week ? `?semana_inicio=${week}` : ''}`);
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

function dashboardDados(req, res) {
  try {
    const data = service.getDashboardGerencial(req.query, req.session?.user?.id || null);
    return res.json({ ok: true, dashboard: data });
  } catch (e) {
    console.error('[PCM Dashboard] Falha ao consultar dados:', { endpoint: req.originalUrl, filtros: req.query, erro: e?.message || e });
    return res.status(400).json({ ok: false, message: e?.message || 'Não foi possível carregar os dados do painel.' });
  }
}

function pdfHeader(req, res, filename, title, subtitle = '') {
  const doc = new PDFDocument({ margin: 34, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.fillColor('#137a3a').fontSize(17).text('CAMPO DO GADO', { align: 'center' });
  doc.fillColor('#10233e').fontSize(15).text(title, { align: 'center' });
  if (subtitle) doc.fillColor('#5d6c7d').fontSize(9).text(subtitle, { align: 'center' });
  doc.moveDown(0.5).fillColor('#5d6c7d').fontSize(8)
    .text(`Emitido em ${new Date().toLocaleString('pt-BR')} por ${req.session?.user?.name || req.session?.user?.email || 'Usuário do sistema'}`);
  doc.moveTo(34, doc.y + 5).lineTo(808, doc.y + 5).strokeColor('#b9d8c3').stroke();
  doc.moveDown();
  return doc;
}

function pdfSection(doc, title) {
  if (doc.y > 520) doc.addPage();
  doc.moveDown(0.5).fillColor('#137a3a').fontSize(11).text(title);
  doc.moveDown(0.25).fillColor('#1f2937').fontSize(8);
}

function pdfLines(doc, rows, formatter, emptyText = 'Sem dados para os filtros selecionados.') {
  if (!rows.length) return doc.text(emptyText);
  rows.forEach((row, index) => {
    if (doc.y > 535) doc.addPage();
    doc.text(`${index + 1}. ${formatter(row)}`, { width: 770, lineGap: 2 });
  });
}

function dashboardPdf(req, res) {
  const data = service.getDashboardGerencial(req.query, req.session?.user?.id || null);
  service.logDashboardReport(req.session?.user?.id || null, 'PDF', data.filtros);
  const doc = pdfHeader(req, res, 'relatorio-gerencial-pcm.pdf', 'Painel Gerencial de Manutenção – PCM', `Período: ${data.filtros.data_inicial} a ${data.filtros.data_final}`);
  pdfSection(doc, 'Resumo executivo');
  doc.text(`OS no período: ${data.cards.total_os || 0} | Corretivas: ${data.cards.corretivas || 0} | Preventivas: ${data.cards.preventivas || 0} | Atrasadas: ${data.cards.os_atrasadas || 0}`);
  doc.text(`Backlog: ${data.cards.backlog_manutencao || 0} | Cumprimento da programação: ${data.cards.cumprimento_programacao || 0}% | Equipamentos críticos: ${data.cards.equipamentos_criticos || 0}`);
  pdfSection(doc, 'Equipamentos que exigem atenção');
  pdfLines(doc, data.equipamentos_atencao.slice(0, 20), (item) => `${item.codigo || '-'} ${item.nome} | ${item.setor || '-'} | ${item.falhas || 0} falhas | ${(item.motivos || []).join('; ')}`);
  pdfSection(doc, 'Ranking de falhas');
  pdfLines(doc, (data.graficos.falhas_equipamento || []).slice(0, 15), (item) => `${item.nome} | ${item.setor || '-'} | ${item.falhas || 0} falhas | ${item.falhas_criticas || 0} críticas | última: ${item.ultima_ocorrencia || '-'}`);
  doc.end();
}

function planejamentoPdf(req, res) {
  const planos = service.listPlanos(req.query || {});
  const resumo = planningSummary(planos);
  const doc = pdfHeader(req, res, 'plano-mestre-pcm.pdf', 'Plano Mestre de Manutenção', `Planos ativos: ${resumo.total} | Atrasados: ${resumo.atrasados} | Próximos: ${resumo.proximos}`);
  pdfSection(doc, 'Atividades planejadas');
  pdfLines(doc, planos, (item) => `${item.equipamento_nome} | ${item.tipo_manutencao} | ${item.atividade_descricao} | próxima: ${item.proxima_data_prevista || 'não definida'} | ${item.situacao}`);
  doc.end();
}

function pecasCriticasPdf(req, res) {
  const pecas = service.listPecasCriticas(req.query || {});
  const resumo = partsSummary(pecas);
  const doc = pdfHeader(req, res, 'pecas-criticas-pcm.pdf', 'Peças Críticas em Estoque', `Itens: ${resumo.total} | Abaixo do mínimo: ${resumo.abaixo_minimo} | Zerados: ${resumo.zeradas}`);
  pdfSection(doc, 'Posição de estoque');
  pdfLines(doc, pecas, (item) => `${item.codigo_interno || '-'} | ${item.descricao_tecnica || item.modelo_comercial || '-'} | atual: ${item.estoque_atual ?? '-'} | mínimo: ${item.estoque_minimo ?? '-'} | ${item.categoria || '-'}`);
  doc.end();
}

function relatoriosAvancadosPdf(req, res) {
  const data = service.getDashboardGerencial(req.query, req.session?.user?.id || null);
  service.logDashboardReport(req.session?.user?.id || null, 'PDF_ANALITICO', data.filtros);
  const doc = pdfHeader(req, res, 'relatorio-indicadores-pcm.pdf', 'Relatório de Indicadores do PCM', `Período: ${data.filtros.data_inicial} a ${data.filtros.data_final}`);
  pdfSection(doc, 'Indicadores do período');
  doc.text(`OS: ${data.cards.total_os || 0} | Corretivas: ${data.cards.corretivas || 0} (${data.cards.percentual_corretiva || 0}%) | Preventivas: ${data.cards.preventivas || 0} (${data.cards.percentual_preventiva || 0}%) | Atrasadas: ${data.cards.os_atrasadas || 0}`);
  pdfSection(doc, 'Ranking de falhas por equipamento');
  pdfLines(doc, (data.graficos.falhas_equipamento || []).slice(0, 30), (item) => `${item.nome} | ${item.setor || '-'} | ${item.falhas || 0} falhas | ${item.falhas_criticas || 0} críticas | média entre falhas: ${item.media_dias_entre_falhas ?? 'dados insuficientes'} dias`);
  pdfSection(doc, 'Ordens consideradas');
  pdfLines(doc, (data.tabelas.ordens || []).slice(0, 80), (item) => `OS #${item.id} | ${item.opened_at || '-'} | ${item.tipo || '-'} | ${item.status || '-'} | ${item.equipamento || '-'} | ${item.setor || '-'}`);
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

function relatoriosAvancadosExcel(req, res) {
  const data = service.getDashboardGerencial(req.query, req.session?.user?.id || null);
  service.logDashboardReport(req.session?.user?.id || null, 'EXCEL_ANALITICO', data.filtros);
  const sheets = [
    tableHtml('Indicadores', [data.cards]),
    tableHtml('Ordens consideradas', data.tabelas.ordens),
    tableHtml('Falhas por equipamento', data.graficos.falhas_equipamento),
    tableHtml('Tipos de manutenção', data.graficos.tipos_manutencao),
    tableHtml('OS por mês', data.graficos.os_mes),
  ];
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="relatorio-indicadores-pcm.xls"');
  return res.send(`<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th{background:#166534;color:#fff}</style></head><body>${sheets.join('<br style="page-break-after:always">')}</body></html>`);
}

module.exports = {
  index,
  dashboardGerencial,
  dashboardDados,
  dashboardPdf,
  dashboardExcel,
  planejamentoPdf,
  pecasCriticasPdf,
  relatoriosAvancadosPdf,
  relatoriosAvancadosExcel,
  planejamento,
  falhas,
  engenharia,
  salvarCriticidade,
  lubrificacao,
  pecasCriticas,
  programacaoSemanal,
  relatoriosAvancados,
  atualizarIndicadores,
  executarAutomacao,
  analisarIA,
  registrarFalha,
  classificarFalha,
  adicionarComponente,
  adicionarLubrificacao,
  sugerirPlanoLubrificacaoIA,
  aplicarSugestaoLubrificacaoIA,
  salvarProgramacao,
  programarBacklog,
  createPlano,
  gerarOS,
  registrarExecucao,
};
