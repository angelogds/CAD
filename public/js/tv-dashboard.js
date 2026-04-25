(() => {
  const REFRESH_MS = 10000;
  const ROTATE_MS = 30000;
  const MAX_ROWS = 8;
  const TV_BASE_WIDTH = 1366;

  let currentScreen = 0;
  let osChart;
  let prevCritChart;
  let prevStatusChart;
  let teamChart;

  const screens = Array.from(document.querySelectorAll('.tv-screen'));
  const indicators = Array.from(document.querySelectorAll('#screen-indicators button'));
  const tvApp = document.getElementById('tv-app');

  document.body.classList.add('tv-body');

  function adjustScale() {
    if (!tvApp) return;
    const scale = Math.min(window.innerWidth / TV_BASE_WIDTH, 1);
    if (window.innerWidth < 1024 || scale >= 1) {
      tvApp.style.transform = '';
      tvApp.style.transformOrigin = '';
      return;
    }
    tvApp.style.transform = `scale(${scale})`;
    tvApp.style.transformOrigin = 'top left';
  }

  function initials(name = '-') {
    return String(name || '-')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((token) => token[0])
      .join('')
      .toUpperCase();
  }

  function avatarHTML(person = {}) {
    if (person?.foto) return `<img src="${person.foto}" alt="Foto de ${person.nome || '-'}">`;
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

  function updateCharts(data) {
    const osStatus = data?.charts?.osStatus || {};
    const prevCrit = data?.charts?.preventivasCriticidade || {};
    const prevStatus = data?.charts?.preventivasStatus || {};
    const team = data?.charts?.equipePerformance || [];

    if (!osChart) {
      osChart = new Chart(document.getElementById('chart-os'), {
        type: 'doughnut',
        data: {
          labels: ['Abertas', 'Em andamento', 'Fechadas'],
          datasets: [{ data: [0, 0, 0], backgroundColor: ['#f59e0b', '#2563eb', '#15803d'] }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
      });
    }

    if (!prevCritChart) {
      prevCritChart = new Chart(document.getElementById('chart-prev-criticidade'), {
        type: 'bar',
        data: {
          labels: ['Baixa', 'Média', 'Alta', 'Crítica'],
          datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#15803d', '#f59e0b', '#ef4444', '#dc2626'] }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }

    if (!prevStatusChart) {
      prevStatusChart = new Chart(document.getElementById('chart-prev-status'), {
        type: 'bar',
        data: {
          labels: ['Abertas', 'Andamento', 'Fechadas', 'Atrasadas'],
          datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#f59e0b', '#2563eb', '#15803d', '#dc2626'] }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }

    if (!teamChart) {
      teamChart = new Chart(document.getElementById('chart-team'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], label: 'Produtividade', backgroundColor: '#2563eb' }] },
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
    const mecanicosOnline = data?.online?.mecanicosOnline || [];
    online.innerHTML = mecanicosOnline.length
      ? mecanicosOnline.map((item) => `<span class="avatar-chip">${avatarHTML(item)}<span>${item.nome || '-'}</span></span>`).join('')
      : '<span class="avatar-chip">Sem mecânicos online</span>';

    const renderChipList = (id, list) => {
      const root = document.getElementById(id);
      root.innerHTML = (list || []).length
        ? list.map((item) => `<span class="chip">${avatarHTML(item)}<span>${item.nome || '-'}</span></span>`).join('')
        : '<span class="chip">-</span>';
    };

    renderChipList('escala-dia', data?.escala?.dia || []);
    renderChipList('escala-apoio', data?.escala?.apoio || []);
    renderChipList('escala-noite', data?.escala?.responsavelNoite ? [data.escala.responsavelNoite] : (data?.escala?.noite || []).slice(0, 1));

    document.getElementById('os-lista').innerHTML = (data?.os?.itens || []).slice(0, MAX_ROWS).map((item) => `
      <tr>
        <td>#${item.id || '-'}</td>
        <td>${item.equipamento || '-'}</td>
        <td>${item.responsavel_exibicao || '-'}</td>
        <td><span class="badge ${badgeClassByValue(item.grau || item.prioridade, 'criticidade')}">${String(item.grau || item.prioridade || '-').toUpperCase()}</span></td>
        <td><span class="badge ${badgeClassByValue(item.status, 'status')}">${item.status || '-'}</span></td>
        <td>${formatDate(item.abertura || item.opened_at)}</td>
      </tr>
    `).join('') || '<tr><td class="empty-row" colspan="6">Nenhuma OS ativa.</td></tr>';

    document.getElementById('prev-lista').innerHTML = (data?.preventivas?.itens || []).slice(0, MAX_ROWS).map((item) => {
      const late = Number(data?.preventivas?.atrasadas || 0) > 0 && badgeClassByValue(item.status, 'status') !== 'green' && (() => {
        const d = item?.data_prevista ? new Date(item.data_prevista) : null;
        return d && !Number.isNaN(d.getTime()) && d < new Date();
      })();
      return `
        <tr class="${late ? 'delay' : ''}">
          <td>#${item.id || '-'}</td>
          <td>${item.equipamento_nome || '-'}</td>
          <td>${item.responsavel_exibicao || '-'}</td>
          <td><span class="badge ${badgeClassByValue(item.criticidade, 'criticidade')}">${String(item.criticidade || '-').toUpperCase()}</span></td>
          <td>${formatDate(item.data_prevista)}</td>
          <td><span class="badge ${badgeClassByValue(item.status, 'status')}">${String(item.status || '-').toUpperCase()}</span></td>
        </tr>
      `;
    }).join('') || '<tr><td class="empty-row" colspan="6">Nenhuma preventiva ativa.</td></tr>';

    const renderRanking = (id, list) => {
      document.getElementById(id).innerHTML = (list || []).map((item, idx) => `
        <li>
          <span class="rk-left"><strong>#${idx + 1}</strong>${avatarHTML(item)}<span>${item.nome || '-'}</span></span>
          <strong>${Number(item.pontuacao || 0)}</strong>
        </li>`).join('') || '<li><span>Sem dados</span><strong>0</strong></li>';
    };

    renderRanking('ranking-mecanicos', data?.ranking?.mecanicos || []);
    renderRanking('ranking-apoio', data?.ranking?.apoio || []);

    document.getElementById('alertas-list').innerHTML = (data?.alertas || []).map((item) => `
      <li class="${item.nivel === 'alta' ? 'high' : ''}">${item.mensagem || '-'}</li>
    `).join('') || '<li>Nenhum alerta ativo.</li>';

    document.getElementById('incidencia-list').innerHTML = (data?.equipamentosIncidencia || []).map((item) => `
      <li><strong>${item.equipamento || '-'}</strong> • ${item.total || 0} ocorrência(s)</li>
    `).join('') || '<li>Sem incidências no período.</li>';

    const ticker = data?.ticker || [];
    const tickerTrack = document.getElementById('tv-ticker-track');
    tickerTrack.textContent = ticker.map((item) => item.texto).join('  •  ');
    const worstPriority = ticker.some((item) => item.prioridade === 'alta')
      ? 'alta'
      : (ticker.some((item) => item.prioridade === 'media') ? 'media' : 'baixa');
    const tickerEl = document.getElementById('tv-ticker');
    tickerEl.classList.remove('priority-alta', 'priority-media', 'priority-baixa');
    tickerEl.classList.add(`priority-${worstPriority}`);

    updateCharts(data);
  }

  async function refreshData() {
    try {
      const response = await fetch('/api/tv-data', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      render(data);
    } catch (_error) {
      // retry on next interval
    }
  }

  indicators.forEach((button) => {
    button.addEventListener('click', () => activateScreen(Number(button.dataset.screen || 0)));
  });

  setDateTime();
  adjustScale();
  activateScreen(0);
  refreshData();

  window.addEventListener('resize', adjustScale);
  setInterval(setDateTime, 1000);
  setInterval(() => activateScreen(currentScreen + 1), ROTATE_MS);
  setInterval(refreshData, REFRESH_MS);
})();
