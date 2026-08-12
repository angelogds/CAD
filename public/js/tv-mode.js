(() => {
  'use strict';
  const config = window.CG_TV_CONFIG || {};
  const REFRESH_MS = Number(config.refreshMs) || 60000;
  const ROTATION_MS = Number(config.rotationMs) || 18000;
  const RETRY_MS = 10000;
  const screens = ['geral', 'criticos', 'os', 'preventivas', 'materiais', 'programacao'];
  const labels = ['VISÃO OPERACIONAL', 'EQUIPAMENTOS CRÍTICOS', 'ORDENS DE SERVIÇO', 'PREVENTIVAS X CORRETIVAS', 'COMPRAS E MATERIAIS', 'PROGRAMAÇÃO DA MANUTENÇÃO'];
  const state = { data: null, index: 0, loading: false, failures: 0, refreshTimer: null, rotationTimer: null, progressTimer: null, rotationAt: Date.now() };
  const $ = (id) => document.getElementById(id);
  const debug = (...args) => { if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') console.info('[TV]', ...args); };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const list = (items, empty, formatter) => items?.length ? `<div class="op-list">${items.map(formatter).join('')}</div>` : `<div class="tv-empty">${empty}</div>`;

  function setConnection(status, message) {
    const el = $('tvConnectionState');
    if (el) { el.className = `tv-connection is-${status}`; el.textContent = message; }
    const online = $('tvOnlineStatus');
    if (online) { online.classList.toggle('is-offline', status === 'error'); online.querySelector('span:last-child').textContent = status === 'error' ? 'SISTEMA INDISPONÍVEL' : 'SISTEMA ONLINE'; }
  }
  function renderLoading() {
    if (state.data) return;
    $('tvContent').innerHTML = '<section class="tv-state"><span class="tv-loader" aria-hidden="true"></span><h2>Carregando informações da manutenção...</h2><p>Aguarde enquanto os indicadores são atualizados.</p></section>';
  }
  function scheduleRefresh(delay = REFRESH_MS) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(loadSnapshot, delay);
  }
  async function loadSnapshot() {
    if (state.loading) return;
    state.loading = true;
    if (!state.data) renderLoading();
    setConnection(state.failures ? 'retrying' : 'loading', state.failures ? 'Tentando reconectar...' : 'Atualizando dados...');
    debug('Buscando indicadores');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(config.snapshotUrl || '/api/tv/snapshot', { cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) throw new Error(`API respondeu HTTP ${response.status}`);
      if (!contentType.includes('application/json')) throw new Error('API retornou conteúdo inválido (JSON esperado)');
      const payload = await response.json();
      if (!payload?.ok || !payload.data) throw new Error(payload?.error || 'Resposta da API sem dados');
      state.data = payload.data;
      state.failures = 0;
      renderTop(payload.generatedAt);
      renderCurrent();
      setConnection('loaded', 'Dados atualizados');
      debug('Dados recebidos');
      scheduleRefresh();
    } catch (error) {
      state.failures += 1;
      console.error('[TV] Erro ao buscar indicadores:', error);
      setConnection('error', 'Erro de comunicação');
      if (!state.data) $('tvContent').innerHTML = '<section class="tv-state is-error"><h2>Não foi possível atualizar os dados.</h2><p>Nova tentativa em alguns segundos.</p></section>';
      scheduleRefresh(RETRY_MS);
    } finally { clearTimeout(timeout); state.loading = false; }
  }
  function renderTop(generatedAt) {
    const updated = $('tvLastUpdate');
    if (updated) updated.textContent = `Última atualização: ${new Date(generatedAt || Date.now()).toLocaleTimeString('pt-BR')}`;
    const w = state.data?.weather;
    if (w && $('tvWeatherMini')) $('tvWeatherMini').innerHTML = `<span>⛅</span><strong>${escapeHtml(w.temp ?? '--')}°</strong><small>${escapeHtml(w.cidade || 'Feira')}</small>`;
  }
  function kpis(os = {}) {
    const values = [['OS abertas', os.abertas, ''], ['Em andamento', os.andamento, ''], ['OS críticas', os.criticas, 'danger'], ['Aguardando material', os.aguardandoMaterial, 'warning'], ['Concluídas hoje', os.concluidasHoje, 'success'], ['OS atrasadas', os.atrasadas, 'danger']];
    return `<div class="op-kpis">${values.map(([label,value,klass]) => `<article class="op-kpi ${klass}"><strong>${Number(value || 0)}</strong><span>${label}</span></article>`).join('')}</div>`;
  }
  function renderGeral(op) {
    return `<section class="op-screen">${kpis(op.os)}<div class="op-columns"><article class="tv-card"><h2>EQUIPAMENTOS PARADOS</h2>${list(op.equipamentosParados, 'Todos os equipamentos registrados estão disponíveis.', x => `<div class="op-row"><strong>${escapeHtml(x.equipamento)}</strong><span class="critical">${escapeHtml(x.status)}</span><small>${escapeHtml(x.motivo)}</small></div>`)}</article><article class="tv-card"><h2>PRÓXIMAS MANUTENÇÕES</h2>${programacao(op.programacao, 5)}</article></div></section>`;
  }
  function renderCriticos(op) {
    debug('Atualizando ranking');
    return `<section class="op-screen op-columns"><article class="tv-card"><h2>EQUIPAMENTOS CRÍTICOS</h2>${list(op.equipamentosCriticos, 'Nenhum equipamento crítico no momento.', x => `<div class="op-row"><strong>${escapeHtml(x.equipamento)}</strong><span class="critical">${escapeHtml(x.criticidade)}</span><small>${x.falhas} ocorrência(s) • ${x.os} OS • ${escapeHtml(x.status)} • Última: ${escapeHtml(x.ultimaOcorrencia)}</small></div>`)}</article><article class="tv-card"><h2>TOP 5 EQUIPAMENTOS COM MAIOR INCIDÊNCIA DE FALHAS</h2>${bars(op.rankingFalhas)}</article></section>`;
  }
  function renderOS(op) { const active = (state.data?.os || []).filter(x => x.status !== 'CONCLUIDA'); return `<section class="op-screen"><article class="tv-card fill"><h2>ORDENS DE SERVIÇO</h2>${kpis(op.os)}${list(active, 'Nenhuma OS ativa no momento.', x => `<div class="op-row grid"><strong>${escapeHtml(x.numero)}</strong><span>${escapeHtml(x.equipamento)}</span><span>${escapeHtml(x.responsavel)}</span><span class="${x.prioridade === 'CRITICA' ? 'critical' : ''}">${escapeHtml(x.prioridade)}</span><small>${escapeHtml(x.status)} • ${escapeHtml(x.tempo)}</small></div>`)}</article></section>`; }
  function renderTipos(op) { const t=op.tipos || {}; return `<section class="op-screen op-columns"><article class="tv-card type-card"><h2>MANUTENÇÃO PREVENTIVA X CORRETIVA</h2><div class="type-values"><div><strong>${t.preventivas || 0}</strong><span>Preventivas • ${t.percentualPreventivas || 0}%</span></div><div><strong>${t.corretivas || 0}</strong><span>Corretivas • ${t.percentualCorretivas || 0}%</span></div></div><div class="type-bar"><i style="width:${t.percentualPreventivas || 0}%"></i></div></article><article class="tv-card"><h2>PREVENTIVAS EM DESTAQUE</h2>${programacao(op.programacao, 8)}</article></section>`; }
  function renderMateriais(op) { return `<section class="op-screen"><article class="tv-card fill"><h2>AGUARDANDO MATERIAL</h2>${list(op.aguardandoMaterial, 'Nenhuma OS aguardando material no momento.', x => `<div class="op-row material"><strong>${escapeHtml(x.os)}</strong><span>${escapeHtml(x.equipamento)}</span><span>${escapeHtml(x.material)}</span><span>${escapeHtml(x.compra)}</span><small>Aguarda há ${escapeHtml(x.espera)}</small></div>`)}</article></section>`; }
  function programacao(items=[], max=10) { return list(items.slice(0,max), 'Nenhuma manutenção programada.', x => `<div class="op-row grid"><strong>${escapeHtml(x.equipamento)}</strong><span>${escapeHtml(x.tarefa)}</span><span>${escapeHtml(x.dataPrevista)}</span><span>${escapeHtml(x.responsavel)}</span><small>${escapeHtml(x.status)}</small></div>`); }
  function renderProgramacao(op) { return `<section class="op-screen"><article class="tv-card fill"><h2>PRÓXIMAS MANUTENÇÕES</h2>${programacao(op.programacao)}</article></section>`; }
  function bars(items=[]) { if (!items.length) return '<div class="tv-empty">Indicador ainda sem dados suficientes.</div>'; const max=Math.max(...items.map(x=>x.falhas),1); return `<div class="op-bars">${items.map(x=>`<div><span>${escapeHtml(x.equipamento)}</span><i><b style="width:${Math.max(4,x.falhas/max*100)}%"></b></i><strong>${x.falhas}</strong></div>`).join('')}</div>`; }
  function renderCurrent() {
    if (!state.data) return;
    const op=state.data.operacao || {};
    const renderers=[renderGeral,renderCriticos,renderOS,renderTipos,renderMateriais,renderProgramacao];
    $('tvScreenLabel').textContent=labels[state.index];
    $('tvScreenIndicator').textContent=`${state.index+1} / ${screens.length}`;
    try { $('tvContent').innerHTML=renderers[state.index](op); } catch(error) { console.error(`[TV] Erro ao renderizar ${screens[state.index]}:`,error); $('tvContent').innerHTML='<section class="tv-state is-error"><h2>Esta seção não pôde ser exibida.</h2><p>Os demais indicadores continuarão atualizando.</p></section>'; }
  }
  function startClock() { const tick=()=>{ const now=new Date(); $('tvClock').textContent=now.toLocaleTimeString('pt-BR'); $('tvDate').textContent=now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}); }; tick(); setInterval(tick,1000); }
  function startRotation() { clearInterval(state.rotationTimer); clearInterval(state.progressTimer); state.rotationTimer=setInterval(()=>{state.index=(state.index+1)%screens.length;state.rotationAt=Date.now();renderCurrent();},ROTATION_MS); state.progressTimer=setInterval(()=>{if($('tvProgress'))$('tvProgress').style.width=`${Math.min(100,(Date.now()-state.rotationAt)/ROTATION_MS*100)}%`;},250); }
  function bind() { $('tvFullscreenBtn')?.addEventListener('click',()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()); $('tvThemeToggle')?.addEventListener('click',()=>document.documentElement.classList.toggle('tv-theme-light')); }
  function init() { debug('Inicializando painel'); startClock(); bind(); renderLoading(); loadSnapshot(); startRotation(); }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded',init,{once:true}) : init();
})();
