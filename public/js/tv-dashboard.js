(() => {
  const REFRESH_MS = 10000;
  const ROTATE_MS = 30000;
  const MAX_ROWS = 8;
  const NEW_OS_HIGHLIGHT_MS = 20000;
  const BANNER_MS = 9000;

  let currentScreen = 0;
  let osChart;
  let prevCritChart;
  let prevStatusChart;
  let teamChart;

  const screens = Array.from(document.querySelectorAll('.tv-screen'));
  const indicators = Array.from(document.querySelectorAll('#screen-indicators button'));

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
    document.getElementById('tv-clock').textContent = now.toLocaleTimeString('pt-BR');
    document.getElementById('tv-date').textContent = now.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  function activateScreen(index) {
    currentScreen = index % screens.length;
    screens.forEach((section, idx) => section.classList.toggle('active', idx === currentScreen));
    indicators.forEach((item, idx) => item.classList.toggle('active', idx === currentScreen));
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

  function alertColorByCriticity(value = '') {
    const val = String(value || '').toUpperCase();
    if (val.includes('CRIT')) return '#dc2626';
    if (val.includes('ALTA')) return '#ef4444';
    if (val.includes('MÉDIA') || val.includes('MEDIA')) return '#f59e0b';
    return '#22c55e';
  }

  function playAlertSound(criticidade = '') {
    const critical = String(criticidade || '').toUpperCase().includes('CRIT');
    const audio = new Audio(critical ? '/audio/os-critica.mp3' : '/audio/os-nova.mp3');
    audio.volume = 0.7;
    audio.play().catch(() => {});
  }

  function showTopAlert(message, high = false) {
    const el = document.getElementById('tv-top-alert');
    if (!el) return;
    el.textContent = message;
    el.className = `tv-top-alert show ${high ? 'high' : 'medium'}`;
    setTimeout(() => {
      el.className = 'tv-top-alert';
      el.textContent = '';
    }, BANNER_MS);
  }

  function notifyNewOS(os = {}) {
    const osId = Number(os.id || 0);
    if (!osId || notifiedOs.has(osId)) return;
    const criticidade = String(os.grau || os.prioridade || '-').toUpperCase();
    playAlertSound(criticidade);
    showTopAlert(`🔴 Nova OS para ${(os.responsavel_exibicao || 'EQUIPE').toUpperCase()} – ${String(os.equipamento || '-').toUpperCase()}`, criticidade.includes('CRIT'));
    notifiedOs.add(osId);
    localStorage.setItem('notifiedOs', JSON.stringify([...notifiedOs]));
  }

  function updateCharts(data) {
    const osStatus = data?.charts?.osStatus || {};
    const prevCrit = data?.charts?.preventivasCriticidade || {};
    const prevStatus = data?.charts?.preventivasStatus || {};
    const team = data?.charts?.equipePerformance || [];

    if (!osChart) {
      osChart = new Chart(document.getElementById('chart-os'), {
        type: 'doughnut',
        data: { labels: ['Abertas', 'Em andamento', 'Fechadas'], datasets: [{ data: [0, 0, 0], backgroundColor: ['#f59e0b', '#2563eb', '#15803d'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
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
        type: 'bar',
        data: { labels: ['Abertas', 'Andamento', 'Fechadas', 'Atrasadas'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#f59e0b', '#2563eb', '#15803d', '#dc2626'] }] },
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
    prevCritChart.data.datasets[0].data = [Number(prevCrit.baixa || 0), Number(prevCrit.media || 0), Number(prevCrit.alta || 0), Number(prevCrit.critica || 0)];
    prevStatusChart.data.datasets[0].data = [Number(prevStatus.abertas || 0), Number(prevStatus.andamento || 0), Number(prevStatus.fechadas || 0), Number(prevStatus.atrasadas || 0)];
    teamChart.data.labels = team.map((item) => item.nome);
    teamChart.data.datasets[0].data = team.map((item) => Number(item.concluidas || 0));

    osChart.update();
    prevCritChart.update();
    prevStatusChart.update();
    teamChart.update();
  }

  function render(data) {
    document.getElementById('os-abertas').textContent = Number(data?.os?.abertas || 0);
    document.getElementById('os-andamento').textContent = Number(data?.os?.andamento || 0);
    document.getElementById('os-criticas').textContent = Number(data?.os?.criticas || 0);

    document.getElementById('prev-abertas').textContent = Number(data?.preventivas?.abertas || 0);
    document.getElementById('prev-andamento').textContent = Number(data?.preventivas?.andamento || 0);
    document.getElementById('prev-fechadas').textContent = Number(data?.preventivas?.fechadas || 0);
    document.getElementById('prev-atrasadas').textContent = Number(data?.preventivas?.atrasadas || 0);

    document.getElementById('attention-os-criticas').textContent = Number(data?.os?.criticas || 0);
    document.getElementById('attention-prev-atrasadas').textContent = Number(data?.preventivas?.atrasadas || 0);

    const online = document.getElementById('online-mecanicos');
    const presence = data?.presence || [];
    online.innerHTML = presence.length
      ? presence.map((item) => `<span class="avatar-chip">${avatarHTML(item)}<span>${item.nome || '-'}</span><span class="state-dot ${item.status || 'offline'}"></span></span>`).join('')
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
      return `<tr class="${isNew ? `row-new-os ${criticidade.includes('CRIT') ? 'is-critical' : ''}` : ''}" style="--alert-color:${alertColorByCriticity(criticidade)};">
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

    const latestOs = [...(data?.os?.itens || [])].sort((a, b) => new Date(b.abertura || b.opened_at || 0).getTime() - new Date(a.abertura || a.opened_at || 0).getTime()).slice(0, 5);
    document.getElementById('latest-os-list').innerHTML = latestOs.map((item) => `<li><strong>#${item.id || '-'}</strong> • ${item.equipamento || '-'} • ${item.responsavel_exibicao || '-'} • ${String(item.status || '').toUpperCase()}</li>`).join('') || '<li>Nenhuma OS recente.</li>';

    const quickAlerts = (data?.os?.itens || []).filter((item) => {
      const c = String(item.grau || item.prioridade || '').toUpperCase();
      const s = String(item.status || '').toUpperCase();
      return c.includes('CRIT') || c.includes('ALTA') || s.includes('PARAD') || s.includes('PAUS');
    }).slice(0, 4);
    document.getElementById('os-quick-alerts').innerHTML = quickAlerts.map((item) => `<li class="high">⚠️ OS #${item.id || '-'} • ${item.equipamento || '-'} • ${String(item.status || '').toUpperCase()} • ${String(item.grau || item.prioridade || '-').toUpperCase()}</li>`).join('') || '<li>Sem alertas críticos de OS no momento.</li>';

    document.getElementById('prev-lista').innerHTML = (data?.preventivas?.itens || []).slice(0, MAX_ROWS).map((item) => `
      <tr>
        <td>#${item.id || '-'}</td>
        <td>${item.equipamento_nome || '-'}</td>
        <td>${item.responsavel_exibicao || '-'}</td>
        <td>${formatDate(item.data_prevista)}</td>
        <td><span class="badge ${badgeClassByValue(item.criticidade, 'criticidade')}">${String(item.criticidade || '-').toUpperCase()}</span></td>
        <td><span class="badge ${badgeClassByValue(item.status, 'status')}">${String(item.status || '-').toUpperCase()}</span></td>
      </tr>`).join('') || '<tr><td class="empty-row" colspan="6">Nenhuma preventiva ativa.</td></tr>';

    const prevAttention = (data?.preventivas?.itens || []).filter((item) => {
      const c = String(item.criticidade || '').toUpperCase();
      const s = String(item.status || '').toUpperCase();
      const d = item?.data_prevista ? new Date(item.data_prevista) : null;
      const late = d && !Number.isNaN(d.getTime()) && d < new Date() && !s.includes('FECH');
      return late || c.includes('CRIT') || c.includes('ALTA');
    }).slice(0, 5);
    document.getElementById('preventivas-alert-list').innerHTML = prevAttention.map((item) => `<li class="${String(item.criticidade || '').toUpperCase().includes('CRIT') ? 'high' : ''}">#${item.id || '-'} • ${item.equipamento_nome || '-'} • ${String(item.criticidade || '-').toUpperCase()} • ${formatDate(item.data_prevista)}</li>`).join('') || '<li>Sem preventivas críticas/atrasadas.</li>';

    const renderRanking = (id, list, summaryLabel) => {
      document.getElementById(id).innerHTML = (list || []).map((item, idx) => `<li><span class="rk-left"><span class="rk-pos">${idx + 1}</span>${avatarHTML(item)}<span><span class="rk-name">${item.nome || '-'}</span><span class="rk-summary">${summaryLabel}</span></span></span><strong class="rk-score">${Number(item.pontuacao || 0)}</strong></li>`).join('') || '<li><span>Sem dados</span><strong>0</strong></li>';
    };
    renderRanking('ranking-mecanicos', data?.ranking?.mecanicos || [], 'OS concluídas na semana');
    renderRanking('ranking-apoio', data?.ranking?.apoio || [], 'Apoio operacional');

    const galleryRoot = document.getElementById('maintenance-gallery');
    const gallery = data?.gallery || [];
    galleryRoot.innerHTML = gallery.length
      ? gallery.map((item) => `<figure class="gallery-item"><img src="${item.src}" alt="Foto OS ${item.osNumero || '-'}" loading="lazy" /><small>OS #${item.osNumero || '-'} • ${item.equipamento || '-'}</small></figure>`).join('')
      : '<div class="gallery-empty">Sem imagens disponíveis</div>';

    document.getElementById('alertas-list').innerHTML = (data?.alertas || []).map((item) => `<li class="${item.nivel === 'alta' ? 'high' : ''}">${item.mensagem || '-'}</li>`).join('') || '<li>Nenhum alerta ativo.</li>';
    document.getElementById('incidencia-list').innerHTML = (data?.equipamentosIncidencia || []).map((item) => `<li><strong>${item.equipamento || '-'}</strong> • ${item.total || 0} ocorrência(s)</li>`).join('') || '<li>Sem incidências no período.</li>';

    const weather = data?.weather || null;
    const weatherRoot = document.getElementById('weather-card-content');
    if (weather?.available) {
      const weekHtml = (weather.week || []).slice(0, 7).map((day) => `<li><span>${day.day || '-'}</span><span>${day.icon || '☁️'} ${day.max || '-'} / ${day.min || '-'}</span></li>`).join('');
      weatherRoot.innerHTML = `<div class="weather-head"><strong>${weather.city || '-'}</strong><span>${weather.temperature || '-'} • ${weather.condition || '-'}</span><small>Chuva: ${weather.rain || '-'} • Umidade: ${weather.humidity || '-'}</small></div><ul class="weather-week">${weekHtml || '<li><span>SEM DADOS</span><span>-</span></li>'}</ul>`;
    } else {
      weatherRoot.innerHTML = 'Previsão indisponível';
    }

    const tickerItems = [...(data?.ticker || [])];
    const newestOsItem = latestOs[0];
    if (newestOsItem && highlightedRows.has(Number(newestOsItem.id || 0))) {
      tickerItems.unshift({
        prioridade: badgeClassByValue(newestOsItem.grau || newestOsItem.prioridade, 'criticidade') === 'red' ? 'alta' : 'media',
        texto: `⚠️ NOVA OS #${newestOsItem.id || '-'} • ${newestOsItem.equipamento || '-'} • Responsável: ${newestOsItem.responsavel_exibicao || '-'} • ${String(newestOsItem.grau || newestOsItem.prioridade || '-').toUpperCase()}`,
      });
    }

    const tickerTrack = document.getElementById('tv-ticker-track');
    tickerTrack.textContent = tickerItems.map((item) => item.texto).join('  •  ');
    const worstPriority = tickerItems.some((item) => item.prioridade === 'alta') ? 'alta' : (tickerItems.some((item) => item.prioridade === 'media') ? 'media' : 'baixa');
    const tickerEl = document.getElementById('tv-ticker');
    tickerEl.classList.remove('priority-alta', 'priority-media', 'priority-baixa');
    tickerEl.classList.add(`priority-${worstPriority}`);

    updateCharts(data);
  }

  async function refreshData() {
    try {
      const response = await fetch('/api/tv-data', { cache: 'no-store' });
      if (!response.ok) return;
      render(await response.json());
    } catch (_e) {}
  }

  indicators.forEach((button) => {
    button.addEventListener('click', () => activateScreen(Number(button.dataset.screen || 0)));
  });

  setDateTime();
  activateScreen(0);
  refreshData();

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

  setInterval(setDateTime, 1000);
  setInterval(() => activateScreen(currentScreen + 1), ROTATE_MS);
  if (!connectTVStream()) setInterval(refreshData, REFRESH_MS);
})();
