(() => {
  const REFRESH_MS = 15000;
  const ROTATE_MS = 30000;
  const MAX_ROWS = 12;
  const NEW_OS_HIGHLIGHT_MS = 20000;
  const BANNER_MS = 10000;

  let currentScreen = 0;
  let osChart;
  let osEquipmentChart;
  let prevCritChart;
  let prevStatusChart;
  let teamChart;
  let rotateStartMs = Date.now();
  let autoRotatePaused = false;
  let resumeTimer = null;
  let galleryIndex = 0;
  let audioCtx;

  const screens = Array.from(document.querySelectorAll('.tv-screen'));
  const screenTitleEl = document.getElementById('tv-screen-title');
  const progressEl = document.getElementById('screen-progress');
  const alertEl = document.getElementById('tv-top-alert');
  const alertTextEl = document.getElementById('tv-top-alert-text');
  const alertOkBtn = document.getElementById('tv-top-alert-ok');
  const statusEl = document.getElementById('tv-system-status');
  const prevScreenBtn = document.getElementById('tv-prev-screen');
  const nextScreenBtn = document.getElementById('tv-next-screen');

  const highlightedRows = new Map();
  const knownOs = new Map();
  const notifiedOs = new Set(JSON.parse(localStorage.getItem('notifiedOs') || '[]'));

  document.body.classList.add('tv-body');

  function initials(name = '-') {
    return String(name || '-')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((token) => token[0])
      .join('')
      .toUpperCase();
  }

  function resolvePhoto(photo) {
    if (!photo) return '';
    if (String(photo).startsWith('http') || String(photo).startsWith('/')) return photo;
    return `/uploads/users/${photo}`;
  }

  function avatarHTML(person = {}) {
    const photo = resolvePhoto(person?.foto);
    if (photo) return `<img src="${photo}" alt="Foto de ${person.nome || '-'}" onerror="this.remove()">`;
    return `<span class="avatar-fallback">${initials(person?.nome)}</span>`;
  }

  function setDateTime() {
    const now = new Date();
    document.getElementById('tv-clock').textContent = now.toLocaleTimeString('pt-BR', { hour12: false });
    document.getElementById('tv-date').textContent = now.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  function activateScreen(index) {
    currentScreen = (index + screens.length) % screens.length;
    screens.forEach((section, idx) => section.classList.toggle('active', idx === currentScreen));
    const title = screens[currentScreen]?.dataset?.title || 'Central de operação';
    if (screenTitleEl) screenTitleEl.textContent = `Modo TV • ${title}`;
    rotateStartMs = Date.now();
  }

  function pauseRotationTemporarily() {
    autoRotatePaused = true;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      autoRotatePaused = false;
      rotateStartMs = Date.now();
    }, 10000);
  }

  function tickProgress() {
    if (!progressEl) return;
    const elapsed = Date.now() - rotateStartMs;
    const pct = Math.max(0, Math.min(100, (elapsed / ROTATE_MS) * 100));
    progressEl.style.width = `${pct}%`;
  }

  function formatDate(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('pt-BR');
  }

  function badgeClassByValue(value = '', type = 'status') {
    const val = String(value || '').toUpperCase();
    if (val.includes('CRIT') || val.includes('ALTA') || val.includes('ATRAS')) return 'red';
    if (val.includes('ANDAMENTO') || val.includes('MEDIA') || val.includes('MÉDIA') || val.includes('ABERTA')) return type === 'status' ? 'yellow' : 'blue';
    if (val.includes('FINAL') || val.includes('FECH') || val.includes('BAIXA') || val.includes('OK')) return 'green';
    return 'blue';
  }

  function playAlertSound() {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.55);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.64);
    } catch (_e) {}
  }

  function showTopAlert(message, high = false) {
    if (!alertEl || !alertTextEl) return;
    alertTextEl.textContent = message;
    alertEl.className = `tv-top-alert show ${high ? 'high' : 'medium'}`;
    clearTimeout(showTopAlert.timer);
    showTopAlert.timer = setTimeout(() => {
      alertEl.className = 'tv-top-alert';
      alertTextEl.textContent = '';
    }, BANNER_MS);
  }

  function askNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }

  function pushDirectedNotification(os = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const nome = os.responsavel_exibicao || 'Equipe';
    const equipamento = os.equipamento || '-';
    new Notification(`${nome}, nova ordem de serviço atribuída a você`, {
      body: `Equipamento: ${equipamento}`,
      icon: '/IMG/menu_campo_do_gado.png.png.png.png.png',
      tag: `os-${os.id || Date.now()}`,
    });
  }

  function notifyNewOS(os = {}) {
    const osId = Number(os.id || 0);
    if (!osId || notifiedOs.has(osId)) return;
    const criticidade = String(os.grau || os.prioridade || '-').toUpperCase();
    playAlertSound();
    pushDirectedNotification(os);
    showTopAlert(`🔴 NOVA ORDEM DE SERVIÇO PARA ${(os.responsavel_exibicao || 'EQUIPE').toUpperCase()} – ${String(os.equipamento || '-').toUpperCase()}`, criticidade.includes('CRIT'));
    notifiedOs.add(osId);
    localStorage.setItem('notifiedOs', JSON.stringify([...notifiedOs]));
  }

  function chartTheme() {
    return {
      label: '#334155',
      grid: '#e2e8f0',
    };
  }

  function applyChartColors(chart) {
    if (!chart) return;
    const t = chartTheme();
    chart.options.plugins = chart.options.plugins || {};
    chart.options.plugins.legend = chart.options.plugins.legend || {};
    chart.options.plugins.legend.labels = { color: t.label };
    if (chart.options.scales) {
      Object.values(chart.options.scales).forEach((axis) => {
        axis.ticks = { ...(axis.ticks || {}), color: t.label };
        axis.grid = { ...(axis.grid || {}), color: t.grid };
      });
    }
  }

  function updateCharts(data) {
    const osStatus = data?.charts?.osStatus || {};
    const prevCrit = data?.charts?.preventivasCriticidade || {};
    const prevStatus = data?.charts?.preventivasStatus || {};
    const team = data?.charts?.equipePerformance || [];
    const equipamento = data?.equipamentosIncidencia || [];

    if (!osChart) {
      osChart = new Chart(document.getElementById('chart-os'), {
        type: 'doughnut',
        data: { labels: ['Abertas', 'Em andamento', 'Fechadas'], datasets: [{ data: [0, 0, 0], backgroundColor: ['#ef4444', '#3b82f6', '#10b981'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
      });
    }

    if (!osEquipmentChart) {
      osEquipmentChart = new Chart(document.getElementById('chart-os-equipment'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: '#2563eb' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }

    if (!prevCritChart) {
      prevCritChart = new Chart(document.getElementById('chart-prev-criticidade'), {
        type: 'bar',
        data: { labels: ['Baixa', 'Média', 'Alta', 'Crítica'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#15803d', '#f59e0b', '#ef4444', '#dc2626'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }

    if (!prevStatusChart) {
      prevStatusChart = new Chart(document.getElementById('chart-prev-status'), {
        type: 'line',
        data: { labels: ['Abertas', 'Andamento', 'Fechadas', 'Atrasadas'], datasets: [{ data: [0, 0, 0, 0], borderColor: '#2563eb', backgroundColor: '#93c5fd', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }

    if (!teamChart) {
      teamChart = new Chart(document.getElementById('chart-team'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], label: 'Produtividade', backgroundColor: '#15803d' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }

    osChart.data.datasets[0].data = [Number(osStatus.abertas || 0), Number(osStatus.andamento || 0), Number(osStatus.fechadas || 0)];
    osEquipmentChart.data.labels = equipamento.map((item) => item.equipamento || '-');
    osEquipmentChart.data.datasets[0].data = equipamento.map((item) => Number(item.total || 0));
    prevCritChart.data.datasets[0].data = [Number(prevCrit.baixa || 0), Number(prevCrit.media || 0), Number(prevCrit.alta || 0), Number(prevCrit.critica || 0)];
    prevStatusChart.data.datasets[0].data = [Number(prevStatus.abertas || 0), Number(prevStatus.andamento || 0), Number(prevStatus.fechadas || 0), Number(prevStatus.atrasadas || 0)];
    teamChart.data.labels = team.map((item) => item.nome);
    teamChart.data.datasets[0].data = team.map((item) => Number(item.concluidas || 0));

    [osChart, osEquipmentChart, prevCritChart, prevStatusChart, teamChart].forEach(applyChartColors);
    osChart.update();
    osEquipmentChart.update();
    prevCritChart.update();
    prevStatusChart.update();
    teamChart.update();
  }

  function medalByIndex(index) {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  }

  function renderTicker(data, latestOs = []) {
    const base = [
      { tipo: 'os', prioridade: 'alta', texto: '⚠️ Nova OS crítica pendente de aceite.' },
      { tipo: 'aviso', prioridade: 'media', texto: '📢 Aviso geral: checklist de turno obrigatório.' },
      { tipo: 'financeiro', prioridade: 'baixa', texto: '💰 Financeiro: centro de custo manutenção atualizado.' },
      { tipo: 'rh', prioridade: 'baixa', texto: '📅 RH: conferir programação de férias do próximo mês.' },
      { tipo: 'critica', prioridade: 'alta', texto: '🔧 Manutenção crítica no Digestor 1 acompanhada em tempo real.' },
      { tipo: 'aviso', prioridade: 'media', texto: '📢 Uso de EPI obrigatório em todas as frentes.' },
      { tipo: 'financeiro', prioridade: 'baixa', texto: '💰 Aprovação de compras até 16h para entrega amanhã.' },
      { tipo: 'rh', prioridade: 'baixa', texto: '📅 Treinamento interno de segurança na quarta-feira.' },
    ];

    const tickerItems = [...(data?.ticker || []).map((item) => ({ ...item, tipo: item.tipo || 'aviso' })), ...base].slice(0, 8);
    const newestOsItem = latestOs[0];
    if (newestOsItem && highlightedRows.has(Number(newestOsItem.id || 0))) {
      tickerItems.unshift({
        tipo: 'os',
        prioridade: badgeClassByValue(newestOsItem.grau || newestOsItem.prioridade, 'criticidade') === 'red' ? 'alta' : 'media',
        texto: `⚠️ Nova OS #${newestOsItem.id || '-'} para ${newestOsItem.responsavel_exibicao || '-'} • ${newestOsItem.equipamento || '-'}`,
      });
    }

    const tickerTrack = document.getElementById('tv-ticker-track');
    tickerTrack.innerHTML = tickerItems.map((item) => `<span class="tk-item tk-${item.tipo || 'aviso'}">${item.texto}</span>`).join('');

    const worstPriority = tickerItems.some((item) => item.prioridade === 'alta') ? 'alta' : (tickerItems.some((item) => item.prioridade === 'media') ? 'media' : 'baixa');
    const tickerEl = document.getElementById('tv-ticker');
    tickerEl.classList.remove('priority-alta', 'priority-media', 'priority-baixa');
    tickerEl.classList.add(`priority-${worstPriority}`);
  }

  function renderGallery(gallery = []) {
    const galleryRoot = document.getElementById('maintenance-gallery');
    if (!gallery.length) {
      galleryRoot.innerHTML = '<div class="gallery-empty">Sem imagens disponíveis</div>';
      return;
    }

    const start = galleryIndex % gallery.length;
    const show = [0, 1, 2, 3].map((offset) => gallery[(start + offset) % gallery.length]);
    galleryRoot.innerHTML = show.map((item) => `<figure class="gallery-item"><img src="${item.src}" alt="Foto OS ${item.osNumero || '-'}" loading="lazy" /><span class="gallery-meta">${avatarHTML({ foto: item.mecanicoFoto, nome: item.mecanicoNome || 'Mecânico' })}<span>${item.mecanicoNome || 'Equipe'}</span></span><small>OS #${item.osNumero || '-'} • ${item.equipamento || '-'}</small></figure>`).join('');
    galleryIndex += 1;
  }

  function calcPerformance(os = {}, preventivas = {}) {
    const crit = Number(os.criticas || 0);
    const atrasadas = Number(preventivas.atrasadas || 0);
    const ativas = Number(os.totalAtivas || os.abertas || 0);
    const mttr = Math.max(0.8, Number((2.2 + crit * 0.4).toFixed(1)));
    const mtbf = Math.max(8, Number((44 - crit * 1.5).toFixed(1)));
    const disponibilidade = Math.max(80, Number((99 - ((crit + atrasadas) / Math.max(1, ativas + 6)) * 18).toFixed(1)));
    return { mttr, mtbf, disponibilidade };
  }

  function render(data) {
    const onlineState = Boolean(data?.sistemaOnline);
    statusEl?.classList.toggle('offline', !onlineState);
    if (statusEl) statusEl.innerHTML = `<span class="dot"></span>Sistema ${onlineState ? 'Online' : 'Offline'}`;

    document.getElementById('os-abertas').textContent = Number(data?.os?.abertas || 0);
    document.getElementById('os-andamento').textContent = Number(data?.os?.andamento || 0);
    document.getElementById('os-criticas').textContent = Number(data?.os?.criticas || 0);

    document.getElementById('prev-abertas').textContent = Number(data?.preventivas?.abertas || 0);
    document.getElementById('prev-andamento').textContent = Number(data?.preventivas?.andamento || 0);
    document.getElementById('prev-fechadas').textContent = Number(data?.preventivas?.fechadas || 0);
    document.getElementById('prev-atrasadas').textContent = Number(data?.preventivas?.atrasadas || 0);

    document.getElementById('attention-os-criticas').textContent = Number(data?.os?.criticas || 0);
    document.getElementById('attention-prev-atrasadas').textContent = Number(data?.preventivas?.atrasadas || 0);

    const perf = calcPerformance(data?.os || {}, data?.preventivas || {});
    document.getElementById('metric-mttr').textContent = perf.mttr;
    document.getElementById('metric-mtbf').textContent = perf.mtbf;
    document.getElementById('metric-disponibilidade').textContent = `${perf.disponibilidade}%`;

    const online = document.getElementById('online-mecanicos');
    const presence = data?.presence || [];
    online.innerHTML = presence.length
      ? presence.map((item) => `<span class="avatar-chip status-${item.status || 'offline'}">${avatarHTML(item)}<span>${item.nome || '-'}</span><span class="state-dot ${item.status || 'offline'}"></span></span>`).join('')
      : '<span class="avatar-chip">Sem equipe online</span>';

    const renderChipList = (id, list) => {
      const root = document.getElementById(id);
      root.innerHTML = (list || []).length
        ? list.map((item) => `<span class="chip">${avatarHTML(item)}<span>${item.nome || '-'}</span></span>`).join('')
        : '<span class="chip">-</span>';
    };

    renderChipList('escala-dia', data?.escala?.dia || []);
    renderChipList('escala-apoio', data?.escala?.apoio || []);
    renderChipList('escala-noite', data?.escala?.responsavelNoite ? [data.escala.responsavelNoite] : (data?.escala?.noite || []).slice(0, 1));

    const nowMs = Date.now();
    const osItems = (data?.os?.itens || []).slice(0, MAX_ROWS);
    const osRows = osItems.map((item) => {
      const osId = Number(item.id || 0);
      if (!knownOs.has(osId)) {
        knownOs.set(osId, nowMs);
        highlightedRows.set(osId, nowMs + NEW_OS_HIGHLIGHT_MS);
        notifyNewOS(item);
      }
      const highlightedUntil = highlightedRows.get(osId) || 0;
      const isNew = highlightedUntil > nowMs;
      const criticidade = String(item.grau || item.prioridade || '-').toUpperCase();
      return `<tr class="${isNew ? `row-new-os ${criticidade.includes('CRIT') ? 'is-critical' : ''}` : ''}">
          <td>#${item.id || '-'}</td>
          <td>${item.equipamento || '-'}</td>
          <td>${item.responsavel_exibicao || '-'}</td>
          <td><span class="badge ${badgeClassByValue(item.grau || item.prioridade, 'criticidade')}">${criticidade}</span></td>
          <td><span class="badge ${badgeClassByValue(item.status, 'status')}">${item.status || '-'}</span></td>
          <td>${formatDate(item.abertura || item.opened_at)}</td>
      </tr>`;
    });

    highlightedRows.forEach((expireAt, osId) => { if (expireAt <= nowMs) highlightedRows.delete(osId); });
    document.getElementById('os-lista').innerHTML = osRows.join('') || '<tr><td class="empty-row" colspan="6">Nenhuma OS ativa.</td></tr>';

    document.getElementById('prev-lista').innerHTML = (data?.preventivas?.itens || []).slice(0, MAX_ROWS).map((item) => {
      const scheduleDate = item?.data_prevista ? new Date(item.data_prevista) : null;
      const status = String(item.status || '').toUpperCase();
      const today = new Date();
      const isToday = scheduleDate && scheduleDate.toDateString() === today.toDateString();
      const overdue = scheduleDate && scheduleDate < today && !status.includes('FECH');
      const rowClass = overdue ? 'row-prev-overdue' : (isToday ? 'row-prev-today' : '');
      return `<tr class="${rowClass}">
        <td>#${item.id || '-'}</td>
        <td>${item.equipamento_nome || '-'}</td>
        <td>${item.responsavel_exibicao || '-'}</td>
        <td>${formatDate(item.data_prevista)}</td>
        <td><span class="badge ${badgeClassByValue(item.criticidade, 'criticidade')}">${String(item.criticidade || '-').toUpperCase()}</span></td>
        <td><span class="badge ${badgeClassByValue(item.status, 'status')}">${status || '-'}</span></td>
      </tr>`;
    }).join('') || '<tr><td class="empty-row" colspan="6">Nenhuma preventiva ativa.</td></tr>';

    const prevAttention = (data?.preventivas?.itens || []).filter((item) => {
      const c = String(item.criticidade || '').toUpperCase();
      const s = String(item.status || '').toUpperCase();
      const d = item?.data_prevista ? new Date(item.data_prevista) : null;
      const late = d && !Number.isNaN(d.getTime()) && d < new Date() && !s.includes('FECH');
      return late || c.includes('CRIT') || c.includes('ALTA');
    }).slice(0, 5);
    document.getElementById('preventivas-alert-list').innerHTML = prevAttention.map((item) => `<li class="${String(item.criticidade || '').toUpperCase().includes('CRIT') ? 'high' : ''}">#${item.id || '-'} • ${item.equipamento_nome || '-'} • ${String(item.criticidade || '-').toUpperCase()} • ${formatDate(item.data_prevista)}</li>`).join('') || '<li>Sem preventivas críticas/atrasadas.</li>';

    const renderRanking = (id, list, summaryLabel) => {
      document.getElementById(id).innerHTML = (list || []).map((item, idx) => `<li><span class="rk-left"><span class="rk-pos">${idx + 1}</span><span class="rk-medal">${medalByIndex(idx)}</span>${avatarHTML(item)}<span><span class="rk-name">${item.nome || '-'}</span><span class="rk-summary">${summaryLabel}</span></span></span><strong class="rk-score">${Number(item.pontuacao || 0)}</strong></li>`).join('') || '<li><span>Sem dados</span><strong>0</strong></li>';
    };
    renderRanking('ranking-mecanicos', data?.ranking?.mecanicos || [], 'OS concluídas na semana');
    renderRanking('ranking-apoio', data?.ranking?.apoio || [], 'Apoio operacional');

    renderGallery(data?.gallery || []);

    document.getElementById('alertas-list').innerHTML = (data?.alertas || []).map((item) => `<li class="${item.nivel === 'alta' ? 'high' : ''}">${item.mensagem || '-'} <button class="ack-btn" type="button">Reconhecer</button></li>`).join('') || '<li>Nenhum alerta ativo.</li>';
    document.querySelectorAll('#alertas-list .ack-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('li');
        if (parent) parent.remove();
      }, { once: true });
    });

    document.getElementById('incidencia-list').innerHTML = (data?.equipamentosIncidencia || []).map((item) => `<li><strong>${item.equipamento || '-'}</strong> • ${item.total || 0} ocorrência(s)</li>`).join('') || '<li>Sem incidências no período.</li>';

    renderTicker(data, data?.os?.itens || []);
    updateCharts(data);
  }

  async function refreshData() {
    try {
      const response = await fetch('/api/tv-data', { cache: 'no-store' });
      if (!response.ok) return;
      render(await response.json());
    } catch (_e) {
      if (statusEl) {
        statusEl.classList.add('offline');
        statusEl.innerHTML = '<span class="dot"></span>Sistema Offline';
      }
    }
  }

  function connectTVStream() {
    if (!window.EventSource) return false;
    try {
      const es = new EventSource('/api/tv-stream');
      es.addEventListener('tv_data', (event) => {
        try { render(JSON.parse(event.data || '{}')); } catch (_e) {}
      });
      es.onerror = () => { try { es.close(); } catch (_e) {} };
      return true;
    } catch (_e) {
      return false;
    }
  }

  setDateTime();
  activateScreen(0);
  askNotificationPermission();
  refreshData();

  setInterval(setDateTime, 1000);
  setInterval(() => {
    if (autoRotatePaused) return;
    activateScreen(currentScreen + 1);
  }, ROTATE_MS);
  setInterval(tickProgress, 200);
  setInterval(refreshData, REFRESH_MS);

  if (!connectTVStream()) setInterval(refreshData, REFRESH_MS);

  prevScreenBtn?.addEventListener('click', () => { pauseRotationTemporarily(); activateScreen(currentScreen - 1); });
  nextScreenBtn?.addEventListener('click', () => { pauseRotationTemporarily(); activateScreen(currentScreen + 1); });

  ['mousemove', 'touchstart', 'keydown'].forEach((eventName) => {
    document.addEventListener(eventName, () => pauseRotationTemporarily(), { passive: true });
  });

  alertOkBtn?.addEventListener('click', () => {
    if (!alertEl || !alertTextEl) return;
    alertEl.className = 'tv-top-alert';
    alertTextEl.textContent = '';
  });
})();
