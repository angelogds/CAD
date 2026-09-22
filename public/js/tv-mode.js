(() => {
  'use strict';

  const config = window.CG_TV_CONFIG || {};
  const ROTATION_MS = Number(config.rotationMs) || 30000;
  const SNAPSHOT_MS = Number(config.refreshMs) || 60000;
  const FAST_MS = Number(config.fastRefreshMs) || 15000;
  const ALERT_MS = Number(config.alertMs) || 15000;
  const CRITICAL_ALERT_MS = Number(config.criticalAlertMs) || 25000;
  const CLOSED = new Set(['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CANCELADA', 'CANCELADO']);
  const priorities = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
  const screens = [
    ['os', 'Ordens de Serviço ativas'],
    ['preventivas', 'Preventivas e corretivas'],
    ['escala', 'Escala da semana'],
    ['desempenho', 'Desempenho da equipe'],
    ['criticidade', 'Criticidade dos equipamentos'],
    ['materiais', 'Materiais e próximas demandas'],
    ['gerencial', 'Indicadores e lubrificação'],
  ];
  const state = {
    data: null,
    index: 0,
    active: false,
    baselineReady: false,
    loading: false,
    snapshotPromise: null,
    stream: null,
    streamOnline: false,
    snapshotTimer: null,
    fastTimer: null,
    reconnectTimer: null,
    rotationTimer: null,
    progressTimer: null,
    rotationStarted: 0,
    rotationRemaining: ROTATION_MS,
    alertQueue: [],
    alertShowing: false,
    alertTimer: null,
    voiceTimer: null,
    currentAlert: null,
    lastVoiceMessage: 'Novas OS serão anunciadas com o nome do mecânico, o equipamento e o local.',
    processed: new Map(),
    pendingEvents: new Map(),
    wakeLock: null,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[c]));
  const plain = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const status = (value) => {
    const s = plain(value).replace(/[\s-]+/g, '_');
    if (CLOSED.has(s)) return s === 'CANCELADO' ? 'CANCELADA' : 'CONCLUIDA';
    if (['ANDAMENTO', 'EM_EXECUCAO', 'EXECUTANDO'].includes(s)) return 'EM_ANDAMENTO';
    if (s.startsWith('AGUARDANDO')) return s === 'AGUARDANDO_EQUIPE' ? 'ABERTA' : 'PAUSADA';
    return s || 'ABERTA';
  };
  const priority = (value) => {
    const p = plain(value);
    if (['EMERGENCIAL', 'URGENTE', 'CRITICA', 'CRITICO'].includes(p)) return 'CRITICA';
    if (p === 'ALTA') return 'ALTA';
    if (['MEDIA', 'MEDIO', 'NORMAL'].includes(p)) return 'MEDIA';
    return 'BAIXA';
  };
  const isOSAtiva = (os) => !CLOSED.has(plain(os?.status).replace(/[\s-]+/g, '_')) && status(os?.status) !== 'CONCLUIDA';
  const osKey = (os) => `${os?.id ?? String(os?.numero || '').replace(/\D/g, '')}:${os?.abertura || os?.opened_at || ''}`;
  const items = (array) => Array.isArray(array) ? array : [];
  const empty = (text) => `<div class="empty">${esc(text)}</div>`;
  const initials = (name) => String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const dateBR = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada';
  const numberBR = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const moneyBR = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(cents || 0) / 100);
  const metricBR = (value, suffix = '') => value === null || value === undefined || Number.isNaN(Number(value)) ? 'Dados insuficientes' : `${numberBR(value)}${suffix}`;
  const labelStatus = (value) => status(value).replaceAll('_', ' ');
  const timeBR = (value) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';

  function readProcessed() {
    try {
      const now = Date.now();
      const saved = JSON.parse(localStorage.getItem('cgTvProcessedOS') || '[]');
      saved.filter((x) => x?.key && now - Number(x.at || 0) < 30 * 86400000).forEach((x) => state.processed.set(x.key, x.at));
      persistProcessed();
    } catch (_error) {
      state.processed = new Map();
    }
  }

  function persistProcessed() {
    try {
      localStorage.setItem('cgTvProcessedOS', JSON.stringify([...state.processed].slice(-500).map(([key, at]) => ({ key, at }))));
    } catch (_error) {}
  }

  function markProcessed(os) {
    state.processed.set(osKey(os), Date.now());
    persistProcessed();
  }

  function setOnline(online) {
    const box = $('tvOnlineStatus')?.parentElement;
    if (box) box.classList.toggle('is-offline', !online);
    if ($('tvOnlineStatus')) $('tvOnlineStatus').textContent = online ? 'Sistema online' : 'Conexão indisponível — exibindo última atualização';
  }

  async function fetchSnapshot({ detectNew = true } = {}) {
    if (state.snapshotPromise) return state.snapshotPromise;
    state.loading = true;
    state.snapshotPromise = (async () => {
      try {
        const response = await fetch(config.snapshotUrl || '/api/tv/snapshot', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error(`Snapshot HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok || !payload.data) throw new Error('Snapshot inválido');
        const incoming = items(payload.data.os).filter(isOSAtiva);
        if (!state.baselineReady) {
          incoming.forEach(markProcessed);
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
        setOnline(false);
        return state.data;
      } finally {
        state.loading = false;
        state.snapshotPromise = null;
      }
    })();
    return state.snapshotPromise;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function eventId(raw) { return String(raw?.id || raw?.id_os || raw?.os_id || String(raw?.numero || '').replace(/\D/g, '')); }
  function findSnapshotOS(id, data = state.data) { return items(data?.os).find((os) => String(os.id) === String(id) || String(os.numero || '').replace(/\D/g, '') === String(id)); }
  function isCompleteOS(os) { return Boolean(os && os.id && os.abertura && os.numero && os.equipamento && os.equipamento !== 'Equipamento não informado' && os.descricao && os.responsavel && os.responsavel !== 'A definir'); }

  async function resolveNewOSEvent(raw) {
    const id = eventId(raw);
    if (!id || !state.baselineReady || !isOSAtiva(raw)) return false;
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
    state.pendingEvents.set(id, task);
    return task;
  }

  function connectStream() {
    if (!state.active || state.stream || typeof EventSource === 'undefined') {
      startFastPolling();
      return;
    }
    const source = new EventSource(config.streamUrl || '/api/tv/stream');
    state.stream = source;
    source.addEventListener('connected', () => {
      state.streamOnline = true;
      stopFastPolling();
      setOnline(true);
    });
    ['os_criada', 'nova_os_emergencial'].forEach((name) => source.addEventListener(name, (event) => {
      let os = {};
      try { os = JSON.parse(event.data || '{}'); } catch (_error) {}
      if (name === 'nova_os_emergencial') os.prioridade = 'EMERGENCIAL';
      resolveNewOSEvent(os);
    }));
    ['os_atualizada', 'os_status_alterado', 'os_em_andamento'].forEach((name) => source.addEventListener(name, () => fetchSnapshot({ detectNew: false })));
    source.onerror = () => {
      state.streamOnline = false;
      setOnline(false);
      source.close();
      state.stream = null;
      startFastPolling();
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectStream, 10000);
    };
  }

  function startFastPolling() {
    if (!state.fastTimer) state.fastTimer = setInterval(() => fetchSnapshot({ detectNew: true }), FAST_MS);
  }
  function stopFastPolling() {
    clearInterval(state.fastTimer);
    state.fastTimer = null;
  }
  function startSnapshotPolling() {
    clearInterval(state.snapshotTimer);
    state.snapshotTimer = setInterval(() => fetchSnapshot({ detectNew: true }), SNAPSHOT_MS);
  }

  function splitResponsaveis(value) {
    const names = String(value || '').split(/\s*,\s*|\s+e\s+/i).map((name) => name.trim()).filter(Boolean)
      .filter((name) => plain(name) !== 'A DEFINIR');
    return [...new Map(names.map((name) => [plain(name), name])).values()];
  }

  function naturalNames(names) {
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function buildVoiceMessage(os) {
    const names = splitResponsaveis(os?.responsavel);
    const number = String(os?.numero || `OS ${os?.id || ''}`).replace('#', 'número ');
    const equipment = String(os?.equipamento || 'equipamento não informado').toLowerCase();
    const local = String(os?.local || os?.setor || 'local não informado').toLowerCase();
    const description = String(os?.descricao || '').trim();
    const salutation = names.length ? `${greeting()} ${naturalNames(names)}.` : 'Atenção, equipe de manutenção.';
    const assignment = names.length > 1
      ? 'Temos uma ordem de serviço aberta para vocês.'
      : names.length === 1 ? 'Temos uma ordem de serviço aberta para você.' : 'Temos uma nova ordem de serviço aberta.';
    const problem = description ? ` Serviço: ${description}.` : '';
    return `${salutation} ${assignment} ${number}. ${equipment}. ${local}.${problem}`.replace(/\s+/g, ' ').trim();
  }

  function speakOS(os) {
    const voiceEnabled = localStorage.getItem('cgTvVoice') !== 'off';
    if (!voiceEnabled || typeof window.speechSynthesis === 'undefined' || typeof window.SpeechSynthesisUtterance === 'undefined') return false;
    const message = buildVoiceMessage(os);
    state.lastVoiceMessage = message;
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(message);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      const voices = window.speechSynthesis.getVoices?.() || [];
      const pt = voices.find((voice) => /^pt-BR$/i.test(voice.lang)) || voices.find((voice) => /^pt/i.test(voice.lang));
      if (pt) utterance.voice = pt;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      console.warn('[TV] Falha ao reproduzir voz', error);
      return false;
    }
  }

  function enqueueAlert(raw) {
    const os = {
      ...raw,
      id: raw.id || raw.id_os,
      abertura: raw.abertura || raw.opened_at || raw.hora_abertura,
      numero: raw.numero || `OS #${raw.id || raw.id_os}`,
      descricao: raw.descricao || raw.texto_resumido,
      prioridade: priority(raw.prioridade || raw.grau),
      status: status(raw.status),
    };
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
    state.alertShowing = true;
    state.currentAlert = state.alertQueue.shift();
    pauseRotation();

    const os = state.currentAlert;
    const alert = $('tvNewOSAlert');
    alert.className = `tv-alert ${os.prioridade}`;
    alert.hidden = false;
    $('tvAlertNumber').textContent = os.numero || `OS #${os.id}`;
    $('tvAlertEquipment').textContent = os.equipamento || 'Equipamento não informado';
    $('tvAlertDescription').textContent = os.descricao || 'Descrição não informada';
    $('tvAlertDetails').innerHTML = `
      <div><dt>Responsável</dt><dd>${esc(os.responsavel || 'A definir')}</dd></div>
      <div><dt>Local</dt><dd>${esc(os.local || os.setor || 'Não informado')}</dd></div>
      <div><dt>Prioridade</dt><dd>${esc(os.prioridade)}</dd></div>
      <div><dt>Abertura</dt><dd>${esc(timeBR(os.abertura))}</dd></div>`;

    const audio = os.prioridade === 'CRITICA' ? $('tvAudioCritical') : $('tvAudioNew');
    const soundEnabled = localStorage.getItem('cgTvSound') !== 'off';
    if (soundEnabled && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => updateSoundLabel(false));
    }

    clearTimeout(state.voiceTimer);
    if (localStorage.getItem('cgTvVoice') !== 'off') {
      state.voiceTimer = setTimeout(() => {
        speakOS(os);
        if (state.index === 0) renderAll();
      }, soundEnabled ? 1400 : 150);
    }

    state.alertTimer = setTimeout(finishAlert, os.prioridade === 'CRITICA' ? CRITICAL_ALERT_MS : ALERT_MS);
  }

  function finishAlert() {
    clearTimeout(state.alertTimer);
    clearTimeout(state.voiceTimer);
    $('tvNewOSAlert').hidden = true;
    state.alertShowing = false;
    state.currentAlert = null;
    if (state.alertQueue.length) showNextAlert();
    else resumeRotation();
  }

  function sortedActiveOS() {
    return items(state.data?.os).filter(isOSAtiva).sort((a, b) => (
      priorities[priority(a.prioridade)] - priorities[priority(b.prioridade)]
      || new Date(a.abertura || a.opened_at || 0) - new Date(b.abertura || b.opened_at || 0)
    ));
  }

  function metrics(values) {
    return `<div class="metrics">${values.map(([label, value, cls = '', detail = '']) => `
      <article class="metric ${cls}">
        <strong class="${typeof value === 'string' && value.length > 8 ? 'metric-text' : ''}">${typeof value === 'string' ? esc(value) : Number(value || 0)}</strong>
        <span>${esc(label)}</span>
        ${detail ? `<small>${esc(detail)}</small>` : ''}
      </article>`).join('')}</div>`;
  }

  function responsibleCell(name) {
    return `<span class="responsible-cell"><i>${initials(name)}</i><b>${esc(name || 'A definir')}</b></span>`;
  }

  function renderAssistantStrip() {
    const enabled = localStorage.getItem('cgTvVoice') !== 'off';
    return `<article class="tv-assistant-strip ${enabled ? 'is-on' : 'is-off'}">
      <div class="assistant-icon" aria-hidden="true">🎙</div>
      <div class="assistant-copy">
        <strong>Assistente de Manutenção — voz</strong>
        <span>“${esc(state.lastVoiceMessage)}”</span>
      </div>
      <div class="assistant-state">
        <strong>${enabled ? 'Assistente ativa' : 'Assistente desativada'}</strong>
        <small>Novos chamados são anunciados com responsável, OS, equipamento e local.</small>
      </div>
    </article>`;
  }

  function renderOS() {
    const os = sortedActiveOS().slice(0, 5);
    const m = state.data?.operacao?.os || {};
    const rows = os.map((o) => {
      const p = priority(o.prioridade);
      const s = status(o.status);
      return `<tr class="priority-${p}">
        <td><strong>${esc(o.numero)}</strong></td>
        <td><div class="equipment-cell"><strong>${esc(o.equipamento)}</strong><small>⌖ ${esc(o.local || o.setor || 'Local não informado')}</small></div></td>
        <td title="${esc(o.descricao)}">${esc(o.descricao || 'Não informada')}</td>
        <td>${responsibleCell(o.responsavel || 'A definir')}</td>
        <td><span class="badge ${p}">${p}</span></td>
        <td><span class="badge status-${s}">${esc(labelStatus(s))}</span></td>
        <td>${esc(timeBR(o.abertura))}</td>
        <td><strong>${esc(o.tempo)}</strong></td>
      </tr>`;
    }).join('');

    const overdueValue = m.atrasadasDisponivel ? m.atrasadas : '—';
    const overdueDetail = m.atrasadasDisponivel ? '' : 'Sem prazo cadastrado';
    return `<div class="screen os-screen">
      ${metrics([
        ['OS abertas', m.abertas],
        ['Em atendimento', m.andamento, 'info'],
        ['Pausadas', m.pausadas, 'warning'],
        ['Críticas / urgentes', m.criticas, 'danger'],
        ['Concluídas hoje', m.concluidasHoje, 'success'],
        ['Atrasadas', overdueValue, 'danger', overdueDetail],
      ])}
      ${renderAssistantStrip()}
      <article class="panel os-panel">
        <div class="panel-heading"><h2>Ordens de Serviço em aberto</h2><span>Mostrando ${os.length} de ${sortedActiveOS().length} OS ativas</span></div>
        <div class="table-wrap">
          <table class="os-table">
            <colgroup><col class="col-os"><col class="col-equipment"><col class="col-problem"><col class="col-owner"><col class="col-priority"><col class="col-status"><col class="col-open"><col class="col-age"></colgroup>
            <thead><tr><th>OS</th><th>Equipamento / Local</th><th>Problema</th><th>Responsável</th><th>Prioridade</th><th>Status</th><th>Abertura</th><th>Em aberto</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${os.length ? '' : empty('Nenhuma OS ativa no momento.')}
      </article>
    </div>`;
  }

  function renderPreventivas() {
    const m = state.data?.operacao?.preventivas || {};
    const prev = items(state.data?.preventivas).slice(0, 7);
    const list = prev.map((p) => `<div class="list-row">
      <div><strong>${esc(p.equipamento)}</strong><small>${esc(p.tarefa)}</small></div>
      <div>${esc(p.responsavel || 'A definir')}</div>
      <div><strong>${dateBR(p.dataPrevista)}</strong><small>${esc(p.criticidade || 'Criticidade não informada')}</small></div>
    </div>`).join('');
    return `<div class="screen section-stack">
      ${metrics([
        ['Pendentes', m.pendentes],
        ['Vencidas', m.vencidas, 'danger'],
        ['Vencendo hoje', m.hoje, 'warning'],
        ['Nesta semana', m.semana],
        ['Corretivas abertas', m.corretivas, 'info'],
        ['Preventivas', `${Number(m.percentualPreventivas || 0)}%`, 'success'],
      ])}
      <div class="screen two">
        <article class="panel"><h2>Composição preventiva × corretiva</h2><div class="donut" style="background:conic-gradient(var(--green2) 0 ${Number(m.percentualPreventivas || 0)}%,var(--orange) 0)"></div><div class="split"><strong>${Number(m.percentualPreventivas || 0)}% preventivas</strong><strong>${Number(m.percentualCorretivas || 0)}% corretivas</strong></div></article>
        <article class="panel"><h2>Próximas preventivas</h2>${list || empty('Nenhuma preventiva programada.')}</article>
      </div>
    </div>`;
  }

  function person(p) {
    return `<div class="person">
      ${p.foto ? `<img src="${esc(p.foto)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'initials',textContent:'${initials(p.nome)}'}))">` : `<span class="initials">${initials(p.nome)}</span>`}
      <div><strong>${esc(p.nome)}</strong><small>${esc(p.funcao || 'Função não informada')}</small></div>
      <span class="badge ${p.situacao === 'ocupado' ? 'status-EM_ANDAMENTO' : p.situacao === 'disponivel' ? 'status-ABERTA' : 'status-PAUSADA'}">${esc(p.situacao === 'ocupado' ? `Em ${p.osAtual || 'OS'}` : p.situacao)}</span>
    </div>`;
  }

  function renderEscala() {
    const e = state.data?.escalaVigente;
    if (!e) return `<div class="screen"><article class="panel">${empty('Escala ainda não cadastrada.')}</article></div>`;
    const column = (title, list, msg) => `<article class="panel"><h2>${title}</h2>${items(list).map(person).join('') || empty(msg)}</article>`;
    return `<div class="screen two">
      ${column('Equipe do dia', e.dia, 'Equipe do dia não cadastrada.')}
      ${column('Equipe da noite', e.noite, 'Equipe da noite não cadastrada.')}
      <article class="panel"><h2>Final de semana</h2>${items(e.finalSemana).length ? items(e.finalSemana).map((n) => `<div class="list-row"><strong>${esc(n)}</strong></div>`).join('') : empty('Responsável não cadastrado.')}</article>
      ${column('Folgas, atestados e fora da escala', [...items(e.afastados), ...items(e.foraEscala)], 'Nenhum afastamento registrado.')}
    </div>`;
  }

  function renderRanking() {
    const ranking = items(state.data?.rankingEquipe);
    if (!ranking.length) return `<div class="screen"><article class="panel">${empty('Sem dados suficientes para o ranking.')}</article></div>`;
    return `<div class="screen"><article class="panel"><h2>Ranking mensal da equipe</h2><div class="cards-list">${
      ranking.slice(0, 8).map((r) => `<div class="rank-row">
        <strong>#${r.posicao} · ${esc(r.nome)}</strong>
        <span>${r.os_finalizadas} OS finalizadas · ${r.criticas} críticas · ${r.altas} altas</span>
        <span><strong>${Number(r.pontos || 0).toFixed(2)} pts</strong><small>${r.cargaAtual} OS em andamento</small></span>
      </div>`).join('')
    }</div></article></div>`;
  }

  function renderCriticidade() {
    const list = items(state.data?.operacao?.equipamentos);
    const max = Math.max(1, ...list.map((e) => e.falhas));
    return `<div class="screen two">
      <article class="panel"><h2>Top 5 — incidência de falhas</h2>${list.map((e) => `<div class="bar-row"><span>${esc(e.nome)}</span><i><b style="width:${e.falhas / max * 100}%"></b></i><strong>${e.falhas}</strong></div>`).join('') || empty('Sem dados suficientes de falhas.')}</article>
      <article class="panel"><h2>Criticidade dos equipamentos</h2>${list.map((e) => `<div class="list-row"><div><strong>${esc(e.nome)}</strong><small>${e.reincidencias} reincidência(s) · MTBF ${e.mtbf || 'Dados insuficientes'}</small></div><span class="badge">${esc(e.criticidade)}</span><strong>${esc(e.situacao)}</strong></div>`).join('') || empty('Nenhuma ocorrência registrada.')}</article>
    </div>`;
  }

  function materialAvailableRow(x) {
    return `<div class="material-row is-available">
      <div class="material-os"><strong>${esc(x.os)}</strong><small>${esc(x.equipamento)} · ${esc(x.setor)}</small></div>
      <div><strong>${esc(x.material)}</strong><small>${esc(x.solicitacaoNumero)} · ${esc(x.localEstoque)}</small></div>
      <div class="material-qty"><strong>${numberBR(x.quantidadeDisponivel)} ${esc(x.unidade)}</strong><span class="badge status-ABERTA">DISPONÍVEL</span></div>
    </div>`;
  }

  function materialFlowRow(x) {
    const forecast = x.previsaoEntrega ? `Previsão ${dateBR(x.previsaoEntrega)}` : 'Sem previsão informada';
    return `<div class="material-row is-flow">
      <div class="material-os"><strong>${esc(x.os)}</strong><small>${esc(x.equipamento)}</small></div>
      <div><strong>${esc(x.material)}</strong><small>${esc(x.solicitacaoNumero)} · ${forecast}</small></div>
      <div class="material-qty"><strong>Falta ${numberBR(x.quantidadePendente)} ${esc(x.unidade)}</strong><span class="badge status-PAUSADA">${esc(x.statusSolicitacao || 'EM COMPRA')}</span></div>
    </div>`;
  }

  function demandRow(d) {
    return `<div class="demand-row priority-${priority(d.prioridade)}">
      <div><strong>#${esc(d.id)} · ${esc(d.titulo)}</strong><small>${esc(d.equipamento)} · ${esc(d.setor)}</small></div>
      <div><span class="badge ${priority(d.prioridade)}">${priority(d.prioridade)}</span><span class="badge status-${esc(status(d.status))}">${esc(labelStatus(d.status))}</span></div>
      <div><strong>${d.prazo ? dateBR(d.prazo) : 'Sem prazo'}</strong><small>${esc(d.responsavel || 'A definir')}</small></div>
    </div>`;
  }

  function renderMateriais() {
    const op = state.data?.operacao || {};
    const resumo = op.materiaisResumo || {};
    const available = items(op.materiaisDisponiveis).slice(0, 5);
    const flow = items(op.materiaisEmFluxo).slice(0, 5);
    const demands = items(op.proximasDemandas).slice(0, 5);

    return `<div class="screen material-screen">
      ${metrics([
        ['Itens disponíveis', resumo.disponiveisRetirada || 0, 'success', 'Prontos para retirada'],
        ['OS com material', resumo.osComMaterialDisponivel || 0, 'success', 'No almoxarifado'],
        ['Itens chegando', resumo.itensEmFluxo || 0, 'warning', 'Compra / recebimento'],
        ['OS aguardando', resumo.osAguardandoMaterial || 0, 'warning', 'Material pendente'],
        ['Próximas demandas', demands.length, 'info', 'Fila operacional'],
        ['Preventivas semana', state.data?.operacao?.preventivas?.semana || 0, '', 'Programação'],
      ])}
      <div class="material-layout">
        <article class="panel material-panel available-panel">
          <div class="panel-heading"><h2>Disponível no almoxarifado</h2><span>Material recebido e ainda não retirado</span></div>
          ${available.map(materialAvailableRow).join('') || empty('Nenhum material de OS disponível para retirada no momento.')}
        </article>
        <article class="panel material-panel flow-panel">
          <div class="panel-heading"><h2>Em recebimento / chegando</h2><span>Itens comprados com quantidade pendente</span></div>
          ${flow.map(materialFlowRow).join('') || empty('Nenhum material comprado aguardando recebimento.')}
        </article>
        <article class="panel material-panel demands-panel">
          <div class="panel-heading"><h2>Próximas demandas da fábrica</h2><span>Prioridade operacional</span></div>
          ${demands.map(demandRow).join('') || empty('Nenhuma demanda operacional pendente.')}
        </article>
      </div>
    </div>`;
  }

  function renderGerencial() {
    const g = state.data?.gerencial || {};
    const cards = g.cards || {};
    const reliability = g.confiabilidade || {};
    const lubrication = g.lubrificacao_semana || {};
    const lubricationSummary = lubrication.resumo || {};
    const lubricationDays = items(lubrication.dias).slice(0, 7);
    const reliabilityTone = reliability.status === 'CONFIAVEL' ? 'success' : reliability.status === 'PARCIAL' ? 'warning' : 'danger';
    const lubricationProgress = Number(lubricationSummary.programadas || 0)
      ? `${Number(lubricationSummary.concluidas || 0)}/${Number(lubricationSummary.programadas || 0)}`
      : '0';

    const lubricationStatus = (value) => {
      const key = plain(value).replace(/[\s-]+/g, '_');
      const map = {
        CONCLUIDA: ['Concluída', 'success'],
        EM_ANDAMENTO: ['Em andamento', 'info'],
        PENDENTE: ['Pendente', 'warning'],
        ATRASADA: ['Atrasada', 'danger'],
        ATENCAO: ['Atenção', 'danger'],
        PROGRAMADA: ['Programada', 'neutral'],
      };
      return map[key] || [key.replaceAll('_', ' ') || 'Programada', 'neutral'];
    };

    const lubricationRows = lubricationDays.map((day) => {
      const [statusLabel, statusTone] = lubricationStatus(day.status);
      const dayLabel = day.data
        ? new Date(`${String(day.data).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
        : '-';
      const equipamentos = items(day.equipamentos);
      const equipmentLabel = equipamentos.slice(0, 2).join(' • ');
      const extra = equipamentos.length > 2 ? ` +${equipamentos.length - 2}` : '';
      return `
        <tr>
          <td><strong>${esc(dayLabel)}</strong></td>
          <td>
            <strong>${esc((equipmentLabel || 'Sem equipamento') + extra)}</strong>
            <small>${Number(day.total_equipamentos || 0)} equipamento(s) · ${Number(day.total_pontos || 0)} ponto(s)</small>
          </td>
          <td>${esc(lubrication.responsavel_nome || 'A definir')}</td>
          <td><span class="tv-lubrication-status ${statusTone}">${esc(statusLabel)}</span></td>
        </tr>`;
    }).join('');

    return `<div class="screen management-screen section-stack">
      ${metrics([
        ['Backlog de OS', cards.backlog_os_atual || 0, 'warning', 'Pendências atuais'],
        ['Backlog > 30 dias', cards.backlog_acima_30_dias || 0, 'danger', 'Envelhecimento crítico'],
        ['Preventivas', `${numberBR(cards.percentual_preventiva || 0)}%`, 'success', 'Participação no período'],
        ['Corretivas', `${numberBR(cards.percentual_corretiva || 0)}%`, 'warning', 'Participação no período'],
        ['Lubrificação semana', lubricationProgress, 'info', 'Concluídas / programadas'],
        ['Qualidade dos dados', cards.qualidade_dados_pct == null ? 'Dados insuficientes' : `${numberBR(cards.qualidade_dados_pct)}%`, reliabilityTone, reliability.status_label || 'Base de confiabilidade'],
      ])}
      <div class="management-layout">
        <article class="panel management-reliability">
          <div class="panel-heading"><h2>Confiabilidade da manutenção</h2><span>${esc(g.periodo?.label || 'Período gerencial')} · ${esc(reliability.status_label || 'Dados insuficientes')}</span></div>
          <div class="management-reliability-grid">
            <div><span>MTBF</span><strong>${esc(reliability.mtbf_dias == null ? 'Dados insuficientes' : metricBR(reliability.mtbf_dias, ' dias'))}</strong><small>${Number(reliability.mtbf_amostras || 0)} intervalo(s) válido(s)</small></div>
            <div><span>MTTR</span><strong>${esc(reliability.mttr_horas == null ? 'Dados insuficientes' : metricBR(reliability.mttr_horas, ' h'))}</strong><small>${Number(reliability.mttr_amostras || 0)} parada(s) válida(s)</small></div>
            <div><span>Disponibilidade</span><strong>${esc(reliability.disponibilidade_pct == null ? 'Dados insuficientes' : metricBR(reliability.disponibilidade_pct, '%'))}</strong><small>${Number(reliability.equipamentos_base || 0)} equipamento(s) na base</small></div>
            <div><span>Horas de parada</span><strong>${esc(reliability.horas_parada == null ? 'Dados insuficientes' : metricBR(reliability.horas_parada, ' h'))}</strong><small>Somente paradas rastreadas</small></div>
          </div>
          <div class="management-reliability-status ${reliabilityTone}"><strong>${esc(reliability.status_label || 'Dados insuficientes')}</strong><span>Os indicadores só aparecem quando a cobertura mínima de dados é atendida.</span></div>
        </article>
        <div class="management-rankings management-rankings--lubrication-only">
          <article class="panel management-lubrication management-lubrication--expanded">
            <div class="panel-heading">
              <h2>Lubrificação da semana</h2>
              <span>${esc(lubrication.responsavel_nome ? `Responsável: ${lubrication.responsavel_nome}` : 'Responsável ainda não definido')} · ${esc(dateBR(lubrication.inicio))} a ${esc(dateBR(lubrication.fim))}</span>
            </div>
            <div class="tv-lubrication-table-wrap">
              <table class="tv-lubrication-table">
                <thead><tr><th>Dia</th><th>Programação</th><th>Responsável</th><th>Status</th></tr></thead>
                <tbody>${lubricationRows || `<tr><td colspan="4">${empty('Nenhuma lubrificação programada para esta semana.')}</td></tr>`}</tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </div>`;
  }

  function renderTicker() {
    const ticker = items(state.data?.ticker).filter((item) => sortedActiveOS().some((os) => `os-${os.id}` === item.id));
    const messages = ticker.length ? ticker.map((x) => x.texto) : ['Nenhuma OS ativa no momento.'];
    const doubled = [...messages, ...messages];
    $('tvTickerTrack').innerHTML = doubled.map((text) => `<span>${esc(text)}</span>`).join('');
  }

  function renderMechanics() {
    $('tvMechanics').innerHTML = items(state.data?.mecanicos).slice(0, 8).map((p) => `<span class="tv-avatar ${esc(p.situacao)}" title="${esc(`${p.nome} — ${p.situacao}`)}">${
      p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nome)}" onerror="this.remove();this.parentElement.textContent='${initials(p.nome)}'">` : initials(p.nome)
    }</span>`).join('');
  }

  function renderAll() {
    if (!state.data) return;
    const renderers = [renderOS, renderPreventivas, renderEscala, renderRanking, renderCriticidade, renderMateriais, renderGerencial];
    document.querySelectorAll('[data-tv-screen]').forEach((el, index) => {
      el.innerHTML = renderers[index]();
      el.classList.toggle('is-active', index === state.index);
    });
    renderTicker();
    renderMechanics();
    updateScreenHeader();
  }

  function updateScreenHeader() {
    $('tvScreenLabel').textContent = screens[state.index][1];
    $('tvScreenIndicator').textContent = `Tela ${state.index + 1} de ${screens.length}`;
  }

  const mascotBreaks = [
    {
      src: '/media/mascote/mascote-tv-01.mp4',
      title: 'Manutenção Campo do Gado',
      subtitle: 'Segurança, disponibilidade e confiabilidade para a operação.',
    },
    {
      src: '/media/mascote/mascote-tv-02.mp4',
      title: 'Manutenção Campo do Gado',
      subtitle: 'Manutenção presente. Produção disponível. Trabalho seguro.',
    },
  ];

  function playMascotBreak(index, onDone) {
    const panel = $('tvMascotBreak');
    const video = $('tvMascotVideo');
    const item = mascotBreaks[index];
    if (!panel || !video || !item) {
      onDone?.();
      return;
    }

    let finished = false;
    let fallbackTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(fallbackTimer);
      video.onended = null;
      video.onerror = null;
      video.pause();
      panel.classList.remove('is-visible');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      onDone?.();
    };

    $('tvMascotTitle').textContent = item.title;
    $('tvMascotSubtitle').textContent = item.subtitle;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.add('is-visible');
    video.muted = true;
    video.defaultMuted = true;
    video.src = item.src;
    video.currentTime = 0;
    video.onended = finish;
    video.onerror = finish;
    video.load();

    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    fallbackTimer = setTimeout(finish, 12000);
  }

  function scheduleRotation(delay = state.rotationRemaining || ROTATION_MS) {
    clearTimeout(state.rotationTimer);
    state.rotationRemaining = delay;
    state.rotationStarted = Date.now();
    state.rotationTimer = setTimeout(() => {
      state.rotationTimer = null;

      // Depois da Tela 2, entra o segundo vídeo antes de seguir para a Tela 3.
      if (state.index === 1) {
        playMascotBreak(1, () => {
          state.index = 2;
          state.rotationRemaining = ROTATION_MS;
          renderAll();
          scheduleRotation(ROTATION_MS);
        });
        return;
      }

      // Ao finalizar a Tela 7, o primeiro vídeo abre o próximo ciclo antes da Tela 1.
      if (state.index === screens.length - 1) {
        playMascotBreak(0, () => {
          state.index = 0;
          state.rotationRemaining = ROTATION_MS;
          renderAll();
          scheduleRotation(ROTATION_MS);
        });
        return;
      }

      state.index += 1;
      state.rotationRemaining = ROTATION_MS;
      renderAll();
      scheduleRotation(ROTATION_MS);
    }, delay);
  }

  function pauseRotation() {
    if (!state.rotationTimer) return;
    state.rotationRemaining = Math.max(250, state.rotationRemaining - (Date.now() - state.rotationStarted));
    clearTimeout(state.rotationTimer);
    state.rotationTimer = null;
  }

  function resumeRotation() {
    if (state.active && !state.alertShowing) scheduleRotation(state.rotationRemaining);
  }

  function startProgress() {
    clearInterval(state.progressTimer);
    state.progressTimer = setInterval(() => {
      if (!state.rotationTimer) return;
      const elapsed = Date.now() - state.rotationStarted;
      $('tvProgress').style.width = `${Math.min(100, elapsed / state.rotationRemaining * 100)}%`;
    }, 250);
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (_error) {}
  }

  function updateSoundLabel(enabled = localStorage.getItem('cgTvSound') !== 'off') {
    $('tvSoundBtn').textContent = enabled ? 'Som ativo' : 'Som desativado';
    $('tvSoundBtn').classList.toggle('is-active', enabled);
  }

  function updateVoiceLabel(enabled = localStorage.getItem('cgTvVoice') !== 'off') {
    if (!$('tvVoiceBtn')) return;
    $('tvVoiceBtn').textContent = enabled ? 'Assistente ativa' : 'Assistente desativada';
    $('tvVoiceBtn').classList.toggle('is-active', enabled);
  }

  async function activate() {
    const activation = $('tvActivation');
    if (activation) {
      activation.hidden = true;
      activation.classList.add('is-hidden');
    }

    for (const audio of [$('tvAudioNew'), $('tvAudioCritical')]) {
      if (!audio) continue;
      audio.load();
      try {
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      } catch (_error) {}
    }

    localStorage.setItem('cgTvSound', 'on');
    localStorage.setItem('cgTvVoice', 'on');
    updateSoundLabel(true);
    updateVoiceLabel(true);
    try { window.speechSynthesis?.getVoices?.(); } catch (_error) {}
    try { await document.documentElement.requestFullscreen?.(); } catch (_error) {}
    requestWakeLock();
  }

  function bind() {
    $('tvActivateBtn').addEventListener('click', activate);
    $('tvFullscreenBtn').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
    $('tvSoundBtn').addEventListener('click', () => {
      const enabled = localStorage.getItem('cgTvSound') === 'off';
      localStorage.setItem('cgTvSound', enabled ? 'on' : 'off');
      updateSoundLabel(enabled);
    });
    $('tvVoiceBtn')?.addEventListener('click', () => {
      const enabled = localStorage.getItem('cgTvVoice') === 'off';
      localStorage.setItem('cgTvVoice', enabled ? 'on' : 'off');
      if (!enabled) window.speechSynthesis?.cancel?.();
      updateVoiceLabel(enabled);
      if (state.index === 0) renderAll();
    });
    $('tvThemeToggle').addEventListener('click', () => {
      const dark = !document.documentElement.classList.contains('tv-theme-dark');
      document.documentElement.classList.toggle('tv-theme-dark', dark);
      localStorage.setItem('cgTvTheme', dark ? 'dark' : 'light');
    });
    document.addEventListener('visibilitychange', () => {
      document.querySelector('.tv-ticker').classList.toggle('is-paused', document.hidden);
      if (!document.hidden && state.active) requestWakeLock();
    });
  }

  function clock() {
    const tick = () => {
      const now = new Date();
      $('tvClock').textContent = now.toLocaleTimeString('pt-BR');
      $('tvDate').textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    };
    tick();
    setInterval(tick, 1000);
  }

  function init() {
    readProcessed();
    document.documentElement.classList.toggle('tv-theme-dark', localStorage.getItem('cgTvTheme') === 'dark');
    bind();
    clock();

    state.active = true;
    fetchSnapshot({ detectNew: false });

    // Abertura do ciclo: vídeo do mascote antes da Tela 1.
    playMascotBreak(0, () => {
      state.index = 0;
      state.rotationRemaining = ROTATION_MS;
      renderAll();
      scheduleRotation(ROTATION_MS);
    });
    startProgress();
    startSnapshotPolling();
    connectStream();
    updateSoundLabel(localStorage.getItem('cgTvSound') !== 'off');
    updateVoiceLabel(localStorage.getItem('cgTvVoice') !== 'off');
  }

  window.CGTVTest = {
    priority,
    status,
    isOSAtiva,
    osKey,
    enqueueAlert,
    resolveNewOSEvent,
    findSnapshotOS,
    isCompleteOS,
    fetchSnapshot,
    finishAlert,
    buildVoiceMessage,
    splitResponsaveis,
    state,
    constants: { ROTATION_MS, SNAPSHOT_MS, FAST_MS, ALERT_MS, CRITICAL_ALERT_MS },
  };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
