(() => {
  'use strict';
  const config = window.CG_TV_CONFIG || {};
  const ROTATION_MS = Number(config.rotationMs) || 30000;
  const SNAPSHOT_MS = Number(config.refreshMs) || 60000;
  const FAST_MS = Number(config.fastRefreshMs) || 15000;
  const ALERT_MS = Number(config.alertMs) || 60000;
  const CLOSED = new Set(['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CANCELADA', 'CANCELADO']);
  const priorities = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
  const screens = [
    ['os', 'Ordens de Serviço ativas'], ['preventivas', 'Preventivas e corretivas'],
    ['escala', 'Escala da semana'], ['desempenho', 'Desempenho da equipe'],
    ['criticidade', 'Criticidade dos equipamentos'], ['materiais', 'Materiais e programação'],
  ];
  const state = { data: null, index: 0, active: false, baselineReady: false, loading: false, snapshotPromise: null, stream: null, streamOnline: false, snapshotTimer: null, fastTimer: null, reconnectTimer: null, rotationTimer: null, progressTimer: null, rotationStarted: 0, rotationRemaining: ROTATION_MS, alertQueue: [], alertShowing: false, processed: new Map(), pendingEvents: new Map(), wakeLock: null };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const plain = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const status = (value) => { const s = plain(value).replace(/[\s-]+/g, '_'); if (CLOSED.has(s)) return s === 'CANCELADO' ? 'CANCELADA' : 'CONCLUIDA'; if (['ANDAMENTO', 'EM_EXECUCAO'].includes(s)) return 'EM_ANDAMENTO'; if (s.startsWith('AGUARDANDO')) return s === 'AGUARDANDO_EQUIPE' ? 'ABERTA' : 'PAUSADA'; return s || 'ABERTA'; };
  const priority = (value) => { const p = plain(value); if (['EMERGENCIAL', 'URGENTE', 'CRITICA', 'CRITICO'].includes(p)) return 'CRITICA'; if (p === 'ALTA') return 'ALTA'; if (['MEDIA', 'MEDIO'].includes(p)) return 'MEDIA'; return 'BAIXA'; };
  const isOSAtiva = (os) => !CLOSED.has(plain(os?.status).replace(/[\s-]+/g, '_')) && status(os?.status) !== 'CONCLUIDA';
  const osKey = (os) => `${os?.id ?? String(os?.numero || '').replace(/\D/g, '')}:${os?.abertura || os?.opened_at || ''}`;
  const items = (array) => Array.isArray(array) ? array : [];
  const empty = (text) => `<div class="empty">${esc(text)}</div>`;
  const initials = (name) => String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const dateBR = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada';

  function readProcessed() {
    try {
      const now = Date.now();
      const saved = JSON.parse(localStorage.getItem('cgTvProcessedOS') || '[]');
      saved.filter((x) => x?.key && now - Number(x.at || 0) < 30 * 86400000).forEach((x) => state.processed.set(x.key, x.at));
      persistProcessed();
    } catch (_error) { state.processed = new Map(); }
  }
  function persistProcessed() {
    try { localStorage.setItem('cgTvProcessedOS', JSON.stringify([...state.processed].slice(-500).map(([key, at]) => ({ key, at })))); } catch (_error) {}
  }
  function markProcessed(os) { state.processed.set(osKey(os), Date.now()); persistProcessed(); }

  function setOnline(online) {
    const box = $('tvOnlineStatus')?.parentElement;
    if (box) box.classList.toggle('is-offline', !online);
    if ($('tvOnlineStatus')) $('tvOnlineStatus').textContent = online ? 'Sistema online' : 'Conexão indisponível — exibindo última atualização';
  }

  async function fetchSnapshot({ detectNew = true } = {}) {
    if (state.snapshotPromise) return state.snapshotPromise;
    state.loading = true;
    state.snapshotPromise = (async () => { try {
      const response = await fetch(config.snapshotUrl || '/api/tv/snapshot', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error(`Snapshot HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.ok || !payload.data) throw new Error('Snapshot inválido');
      const incoming = items(payload.data.os).filter(isOSAtiva);
      if (!state.baselineReady) {
        incoming.forEach(markProcessed); // A primeira carga nunca notifica OS preexistentes.
        state.baselineReady = true;
      } else if (detectNew && state.active) {
        incoming.filter((os) => !state.processed.has(osKey(os))).forEach(enqueueAlert);
      }
      state.data = payload.data;
      setOnline(true);
      if ($('tvLastUpdate')) $('tvLastUpdate').textContent = `Última atualização: ${new Date(payload.generatedAt || Date.now()).toLocaleTimeString('pt-BR')}`;
      renderAll();
      return payload.data;
    } catch (error) {
      console.error('[TV]', error);
      setOnline(false); // conserva o último snapshot válido
      return state.data;
    } finally { state.loading = false; state.snapshotPromise = null; } })();
    return state.snapshotPromise;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function eventId(raw) { return String(raw?.id || raw?.id_os || raw?.os_id || String(raw?.numero || '').replace(/\D/g, '')); }
  function findSnapshotOS(id, data = state.data) { return items(data?.os).find((os) => String(os.id) === String(id) || String(os.numero || '').replace(/\D/g, '') === String(id)); }
  function isCompleteOS(os) { return Boolean(os && os.id && os.abertura && os.numero && os.equipamento && os.equipamento !== 'Equipamento não informado' && os.descricao && os.responsavel && os.responsavel !== 'A definir'); }
  async function resolveNewOSEvent(raw) {
    const id = eventId(raw); if (!id || !state.baselineReady || !isOSAtiva(raw)) return false;
    if (state.pendingEvents.has(id)) return state.pendingEvents.get(id);
    const task = (async () => {
      let resolved = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const data = await fetchSnapshot({ detectNew: false });
        resolved = findSnapshotOS(id, data);
        if (isCompleteOS(resolved)) break;
        if (attempt < 3) await sleep(750 * (attempt + 1));
      }
      const candidate = resolved ? { ...raw, ...resolved } : raw;
      return isOSAtiva(candidate) ? enqueueAlert(candidate) : false;
    })().finally(() => state.pendingEvents.delete(id));
    state.pendingEvents.set(id, task); return task;
  }

  function connectStream() {
    if (!state.active || state.stream || typeof EventSource === 'undefined') { startFastPolling(); return; }
    const source = new EventSource(config.streamUrl || '/api/tv/stream');
    state.stream = source;
    source.addEventListener('connected', () => { state.streamOnline = true; stopFastPolling(); setOnline(true); });
    ['os_criada', 'nova_os_emergencial'].forEach((name) => source.addEventListener(name, (event) => {
      let os = {}; try { os = JSON.parse(event.data || '{}'); } catch (_error) {}
      if (name === 'nova_os_emergencial') os.prioridade = 'EMERGENCIAL';
      resolveNewOSEvent(os);
    }));
    ['os_atualizada', 'os_status_alterado', 'os_em_andamento'].forEach((name) => source.addEventListener(name, () => fetchSnapshot({ detectNew: false })));
    source.onerror = () => {
      state.streamOnline = false; setOnline(false); source.close(); state.stream = null; startFastPolling();
      clearTimeout(state.reconnectTimer); state.reconnectTimer = setTimeout(connectStream, 10000);
    };
  }
  function startFastPolling() { if (!state.fastTimer) state.fastTimer = setInterval(() => fetchSnapshot({ detectNew: true }), FAST_MS); }
  function stopFastPolling() { clearInterval(state.fastTimer); state.fastTimer = null; }
  function startSnapshotPolling() { clearInterval(state.snapshotTimer); state.snapshotTimer = setInterval(() => fetchSnapshot({ detectNew: true }), SNAPSHOT_MS); }

  function enqueueAlert(raw) {
    const os = { ...raw, id: raw.id || raw.id_os, abertura: raw.abertura || raw.opened_at || raw.hora_abertura, numero: raw.numero || `OS #${raw.id || raw.id_os}`, descricao: raw.descricao || raw.texto_resumido, prioridade: priority(raw.prioridade || raw.grau), status: status(raw.status) };
    const key = osKey(os);
    if (!key || state.processed.has(key) || state.alertQueue.some((x) => osKey(x) === key) || (state.currentAlert && osKey(state.currentAlert) === key) || !isOSAtiva(os)) return false;
    markProcessed(os);
    os.arrival = Date.now();
    state.alertQueue.push(os);
    state.alertQueue.sort((a, b) => priorities[a.prioridade] - priorities[b.prioridade] || a.arrival - b.arrival);
    showNextAlert();
    return true;
  }
  function showNextAlert() {
    if (state.alertShowing || !state.active || !state.alertQueue.length) return;
    state.alertShowing = true; state.currentAlert = state.alertQueue.shift(); pauseRotation();
    const os = state.currentAlert; const alert = $('tvNewOSAlert');
    alert.className = `tv-alert ${os.prioridade}`; alert.hidden = false;
    $('tvAlertNumber').textContent = os.numero || `OS #${os.id}`;
    $('tvAlertEquipment').textContent = os.equipamento || 'Equipamento não informado';
    $('tvAlertDescription').textContent = os.descricao || 'Descrição não informada';
    $('tvAlertDetails').innerHTML = `<div><dt>Responsável</dt><dd>${esc(os.responsavel || 'A definir')}</dd></div><div><dt>Prioridade</dt><dd>${esc(os.prioridade)}</dd></div><div><dt>Status</dt><dd>${esc(os.status)}</dd></div><div><dt>Abertura</dt><dd>${esc(os.abertura ? new Date(os.abertura).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Não informada')}</dd></div>`;
    const audio = os.prioridade === 'CRITICA' ? $('tvAudioCritical') : $('tvAudioNew');
    if (localStorage.getItem('cgTvSound') !== 'off') { audio.currentTime = 0; audio.play().catch(() => updateSoundLabel(false)); }
    state.alertTimer = setTimeout(finishAlert, ALERT_MS);
  }
  function finishAlert() {
    clearTimeout(state.alertTimer); $('tvNewOSAlert').hidden = true; state.alertShowing = false; state.currentAlert = null;
    if (state.alertQueue.length) showNextAlert(); else resumeRotation();
  }

  function sortedActiveOS() {
    return items(state.data?.os).filter(isOSAtiva).sort((a, b) => priorities[priority(a.prioridade)] - priorities[priority(b.prioridade)] || new Date(a.abertura || a.opened_at || 0) - new Date(b.abertura || b.opened_at || 0));
  }
  function metrics(values) { return `<div class="metrics">${values.map(([label, value, cls = '']) => `<article class="metric ${cls}"><strong>${typeof value === 'string' ? esc(value) : Number(value || 0)}</strong><span>${esc(label)}</span></article>`).join('')}</div>`; }
  function renderOS() {
    const os = sortedActiveOS().slice(0, 9), m = state.data?.operacao?.os || {};
    const rows = os.map((o) => `<tr class="priority-${priority(o.prioridade)}"><td><strong>${esc(o.numero)}</strong></td><td>${esc(o.equipamento)}</td><td title="${esc(o.descricao)}">${esc(o.descricao || 'Não informada')}</td><td>${esc(o.responsavel || 'A definir')}</td><td><span class="badge ${priority(o.prioridade)}">${priority(o.prioridade)}</span></td><td>${esc(status(o.status).replaceAll('_', ' '))}</td><td>${esc(o.abertura ? new Date(o.abertura).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-')}</td><td>${esc(o.tempo)}</td></tr>`).join('');
    return `<div class="screen os-screen">${metrics([['OS abertas',m.abertas],['Em andamento',m.andamento],['Pausadas',m.pausadas,'warning'],['Atrasadas',m.atrasadasDisponivel ? m.atrasadas : 'Prazo não cadastrado','danger'],['Críticas / urgentes',m.criticas,'danger'],['Concluídas hoje',m.concluidasHoje]])}<article class="panel"><table><thead><tr><th>OS</th><th>Equipamento</th><th>Serviço</th><th>Mecânico(s)</th><th>Prioridade</th><th>Status</th><th>Abertura</th><th>Em aberto</th></tr></thead><tbody>${rows}</tbody></table>${os.length ? '' : empty('Nenhuma OS ativa no momento.')}</article></div>`;
  }
  function renderPreventivas() {
    const m = state.data?.operacao?.preventivas || {}, prev = items(state.data?.preventivas).slice(0, 7);
    const list = prev.map((p) => `<div class="list-row"><div><strong>${esc(p.equipamento)}</strong><small>${esc(p.tarefa)}</small></div><div>${esc(p.responsavel || 'A definir')}</div><div><strong>${dateBR(p.dataPrevista)}</strong><small>${esc(p.criticidade || 'Criticidade não informada')}</small></div></div>`).join('');
    return `<div class="screen section-stack">${metrics([['Pendentes',m.pendentes],['Vencidas',m.vencidas,'danger'],['Vencendo hoje',m.hoje,'warning'],['Nesta semana',m.semana],['Corretivas abertas',m.corretivas],['Preventivas',m.percentualPreventivas]])}<div class="screen two"><article class="panel"><h2>Composição preventiva × corretiva</h2><div class="donut" style="background:conic-gradient(var(--green2) 0 ${Number(m.percentualPreventivas||0)}%,var(--orange) 0)"></div><div class="split"><strong>${Number(m.percentualPreventivas||0)}% preventivas</strong><strong>${Number(m.percentualCorretivas||0)}% corretivas</strong></div></article><article class="panel"><h2>Próximas preventivas</h2>${list || empty('Nenhuma preventiva programada.')}</article></div></div>`;
  }
  function person(p) { return `<div class="person">${p.foto ? `<img src="${esc(p.foto)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'initials',textContent:'${initials(p.nome)}'}))">` : `<span class="initials">${initials(p.nome)}</span>`}<div><strong>${esc(p.nome)}</strong><small>${esc(p.funcao || 'Função não informada')}</small></div><span class="badge">${esc(p.situacao === 'ocupado' ? `Em ${p.osAtual || 'OS'}` : p.situacao)}</span></div>`; }
  function renderEscala() {
    const e = state.data?.escalaVigente; if (!e) return `<div class="screen"><article class="panel">${empty('Escala ainda não cadastrada.')}</article></div>`;
    const column = (title, list, msg) => `<article class="panel"><h2>${title}</h2>${items(list).map(person).join('') || empty(msg)}</article>`;
    return `<div class="screen two">${column('Equipe do dia',e.dia,'Equipe do dia não cadastrada.')}${column('Equipe da noite',e.noite,'Equipe da noite não cadastrada.')}<article class="panel"><h2>Final de semana</h2>${items(e.finalSemana).length ? items(e.finalSemana).map((n)=>`<div class="list-row"><strong>${esc(n)}</strong></div>`).join('') : empty('Responsável não cadastrado.')}</article>${column('Folgas, atestados e fora da escala',[...items(e.afastados),...items(e.foraEscala)],'Nenhum afastamento registrado.')}</div>`;
  }
  function renderRanking() {
    const ranking = items(state.data?.rankingEquipe); if (!ranking.length) return `<div class="screen"><article class="panel">${empty('Sem dados suficientes para o ranking.')}</article></div>`;
    return `<div class="screen"><article class="panel"><h2>Ranking mensal da equipe</h2><div class="cards-list">${ranking.slice(0,8).map((r)=>`<div class="rank-row"><strong>#${r.posicao} · ${esc(r.nome)}</strong><span>${r.os_finalizadas} OS finalizadas · ${r.criticas} críticas · ${r.altas} altas</span><span><strong>${r.pontos} pts</strong><small>${r.cargaAtual} OS em andamento</small></span></div>`).join('')}</div></article></div>`;
  }
  function renderCriticidade() {
    const list = items(state.data?.operacao?.equipamentos), max = Math.max(1,...list.map((e)=>e.falhas));
    return `<div class="screen two"><article class="panel"><h2>Top 5 — incidência de falhas</h2>${list.map((e)=>`<div class="bar-row"><span>${esc(e.nome)}</span><i><b style="width:${e.falhas/max*100}%"></b></i><strong>${e.falhas}</strong></div>`).join('') || empty('Sem dados suficientes de falhas.')}</article><article class="panel"><h2>Criticidade dos equipamentos</h2>${list.map((e)=>`<div class="list-row"><div><strong>${esc(e.nome)}</strong><small>${e.reincidencias} reincidência(s) · MTBF ${e.mtbf || 'Dados insuficientes'}</small></div><span class="badge">${esc(e.criticidade)}</span><strong>${esc(e.situacao)}</strong></div>`).join('') || empty('Nenhuma ocorrência registrada.')}</article></div>`;
  }
  function renderMateriais() {
    const waiting = items(state.data?.operacao?.aguardandoMaterial), plan = items(state.data?.operacao?.programacao).slice(0,6);
    const a = waiting.map((x)=>`<div class="list-row"><div><strong>${esc(x.os)} · ${esc(x.equipamento)}</strong><small>${esc(x.material || 'Motivo não informado')}</small></div><strong>${esc(x.espera)}</strong></div>`).join('');
    const b = plan.map((x)=>`<div class="list-row"><div><strong>${esc(x.equipamento)}</strong><small>${esc(x.tarefa)}</small></div><span>${esc(x.responsavel || 'A definir')}</span><strong>${dateBR(x.dataPrevista)}</strong></div>`).join('');
    return `<div class="screen two"><article class="panel"><h2>Aguardando material</h2>${a || empty('Nenhuma OS aguardando material no momento.')}</article><article class="panel"><h2>Próximas manutenções programadas</h2>${b || empty('Nenhuma manutenção programada.')}</article></div>`;
  }
  function renderTicker() {
    const ticker = items(state.data?.ticker).filter((item) => sortedActiveOS().some((os) => `os-${os.id}` === item.id));
    const messages = ticker.length ? ticker.map((x) => x.texto) : ['Nenhuma OS ativa no momento.'];
    const doubled = [...messages, ...messages]; $('tvTickerTrack').innerHTML = doubled.map((text) => `<span>${esc(text)}</span>`).join('');
  }
  function renderMechanics() { $('tvMechanics').innerHTML = items(state.data?.mecanicos).slice(0,8).map((p)=>`<span class="tv-avatar ${esc(p.situacao)}" title="${esc(`${p.nome} — ${p.situacao}`)}">${p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nome)}" onerror="this.remove();this.parentElement.textContent='${initials(p.nome)}'">` : initials(p.nome)}</span>`).join(''); }
  function renderAll() {
    if (!state.data) return;
    const renderers = [renderOS, renderPreventivas, renderEscala, renderRanking, renderCriticidade, renderMateriais];
    document.querySelectorAll('[data-tv-screen]').forEach((el, index) => { el.innerHTML = renderers[index](); el.classList.toggle('is-active', index === state.index); });
    renderTicker(); renderMechanics(); updateScreenHeader();
  }
  function updateScreenHeader() { $('tvScreenLabel').textContent = screens[state.index][1]; $('tvScreenIndicator').textContent = `Tela ${state.index + 1} de ${screens.length}`; }

  function scheduleRotation(delay = state.rotationRemaining || ROTATION_MS) {
    clearTimeout(state.rotationTimer); state.rotationRemaining = delay; state.rotationStarted = Date.now();
    state.rotationTimer = setTimeout(() => { state.index = (state.index + 1) % screens.length; state.rotationRemaining = ROTATION_MS; renderAll(); scheduleRotation(ROTATION_MS); }, delay);
  }
  function pauseRotation() { if (!state.rotationTimer) return; state.rotationRemaining = Math.max(250, state.rotationRemaining - (Date.now() - state.rotationStarted)); clearTimeout(state.rotationTimer); state.rotationTimer = null; }
  function resumeRotation() { if (state.active && !state.alertShowing) scheduleRotation(state.rotationRemaining); }
  function startProgress() { clearInterval(state.progressTimer); state.progressTimer = setInterval(() => { if (!state.rotationTimer) return; const elapsed = Date.now() - state.rotationStarted; $('tvProgress').style.width = `${Math.min(100, elapsed / state.rotationRemaining * 100)}%`; }, 250); }
  async function requestWakeLock() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') state.wakeLock = await navigator.wakeLock.request('screen'); } catch (_error) {} }
  function updateSoundLabel(enabled = localStorage.getItem('cgTvSound') !== 'off') { $('tvSoundBtn').textContent = enabled ? 'Som ativo' : 'Som desativado'; }
  async function activate() {
    state.active = true; $('tvActivation').hidden = true;
    for (const audio of [$('tvAudioNew'), $('tvAudioCritical')]) { audio.load(); try { audio.muted = true; await audio.play(); audio.pause(); audio.currentTime = 0; audio.muted = false; } catch (_error) {} }
    document.documentElement.requestFullscreen?.().catch?.(() => {}); requestWakeLock(); scheduleRotation(ROTATION_MS); startProgress(); startSnapshotPolling(); connectStream(); updateSoundLabel();
  }
  function bind() {
    $('tvActivateBtn').addEventListener('click', activate);
    $('tvFullscreenBtn').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
    $('tvSoundBtn').addEventListener('click', () => { const enabled = localStorage.getItem('cgTvSound') === 'off'; localStorage.setItem('cgTvSound', enabled ? 'on' : 'off'); updateSoundLabel(enabled); });
    $('tvThemeToggle').addEventListener('click', () => { const dark = !document.documentElement.classList.contains('tv-theme-dark'); document.documentElement.classList.toggle('tv-theme-dark', dark); localStorage.setItem('cgTvTheme', dark ? 'dark' : 'light'); });
    document.addEventListener('visibilitychange', () => { document.querySelector('.tv-ticker').classList.toggle('is-paused', document.hidden); if (!document.hidden && state.active) requestWakeLock(); });
  }
  function clock() { const tick = () => { const now = new Date(); $('tvClock').textContent = now.toLocaleTimeString('pt-BR'); $('tvDate').textContent = now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}); }; tick(); setInterval(tick,1000); }
  function init() { readProcessed(); document.documentElement.classList.toggle('tv-theme-dark', localStorage.getItem('cgTvTheme') === 'dark'); bind(); clock(); fetchSnapshot({ detectNew: false }); updateSoundLabel(); }
  window.CGTVTest = { priority, status, isOSAtiva, osKey, enqueueAlert, resolveNewOSEvent, findSnapshotOS, isCompleteOS, fetchSnapshot, finishAlert, state, constants: { ROTATION_MS, SNAPSHOT_MS, FAST_MS, ALERT_MS } };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
