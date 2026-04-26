(() => {
  const config = window.CG_TV_CONFIG || {};

  const state = {
    data: null,
    screenIndex: 0,
    screens: ['os', 'preventivas', 'equipe', 'galeria', 'alertas'],
    rotationStartedAt: Date.now(),
    theme: localStorage.getItem('cg-tv-theme') || 'dark',
    pausedUntil: 0
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function setTheme() {
    document.documentElement.classList.toggle('tv-theme-light', state.theme === 'light');
    document.documentElement.classList.toggle('tv-theme-dark', state.theme !== 'light');

    const icon = $('tvThemeIcon');
    if (icon) icon.textContent = state.theme === 'light' ? '🌙' : '☀️';

    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      state.theme === 'light' ? '#eef4f8' : '#0a0f1a'
    );
  }

  function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('cg-tv-theme', state.theme);
    setTheme();
    showToast(state.theme === 'light' ? 'Modo claro ativado' : 'Modo escuro ativado');
  }

  function showToast(message) {
    const toast = $('tvToast');
    if (!toast) return;

    toast.textContent = message;
    toast.hidden = false;

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 2600);
  }

  function startClock() {
    function tick() {
      const now = new Date();

      const clock = $('tvClock');
      const date = $('tvDate');

      if (clock) {
        clock.textContent = now.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }

      if (date) {
        date.textContent = now.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long'
        });
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  async function loadSnapshot() {
    try {
      const response = await fetch(config.snapshotUrl || '/api/tv/snapshot', {
        headers: { Accept: 'application/json' }
      });

      const json = await response.json();

      if (!json.ok) throw new Error(json.error || 'Erro no snapshot');

      state.data = json.data;

      renderTop();
      renderTicker();
      renderCurrentScreen();
      checkCriticalLed();

      const last = $('tvLastUpdate');
      if (last) {
        last.textContent = new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (err) {
      console.error('[TV] erro ao carregar snapshot:', err);

      const content = $('tvContent');
      if (content) {
        content.innerHTML = `
          <section class="tv-error">
            <h1>Erro ao carregar Modo TV</h1>
            <p>${escapeHtml(err.message)}</p>
          </section>
        `;
      }
    }
  }

  function renderTop() {
    const data = state.data || {};
    const mecanicos = data.mecanicos || [];

    const avatarBox = $('tvAvatars');

    if (avatarBox) {
      avatarBox.innerHTML = mecanicos.slice(0, 5).map(m => `
        <div class="tv-avatar ${m.status === 'ativo' ? 'is-active' : ''}" title="${escapeHtml(m.nome)}">
          <img src="${escapeHtml(m.foto || config.defaultAvatar)}" onerror="this.src='${config.defaultAvatar}'">
          <span></span>
        </div>
      `).join('');
    }

    const weatherMini = $('tvWeatherMini');
    if (weatherMini && data.weather) {
      weatherMini.innerHTML = `
        <span>${weatherIcon(data.weather.codigo)}</span>
        <strong>${escapeHtml(data.weather.temp)}°</strong>
        <small>${escapeHtml(data.weather.cidade || 'Feira')}</small>
      `;
    }
  }

  function weatherIcon(code) {
    const c = Number(code);
    if (c === 0) return '☀️';
    if ([1, 2].includes(c)) return '🌤️';
    if (c === 3) return '☁️';
    if ([45, 48].includes(c)) return '🌫️';
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(c)) return '🌧️';
    if ([95, 96, 99].includes(c)) return '⛈️';
    return '⛅';
  }

  function statusBadge(status) {
    const label = {
      ABERTA: '⚠ ABERTA',
      EM_ANDAMENTO: '🔧 EM ANDAMENTO',
      PAUSADA: '⏸ PAUSADA',
      CONCLUIDA: '✅ CONCLUÍDA',
      ATRASADA: '⚠ ATRASADA',
      PENDENTE: '⏳ PENDENTE',
      NO_PRAZO: '✅ NO PRAZO'
    }[status] || status;

    return `<span class="tv-badge status-${String(status).toLowerCase()}">${label}</span>`;
  }

  function prioridadeBadge(prioridade) {
    const label = prioridade === 'CRITICA' ? 'CRÍTICA' : prioridade;
    return `<span class="tv-badge prio-${String(prioridade).toLowerCase()}">${label}</span>`;
  }

  function setActiveNav(screen) {
    document.querySelectorAll('.tv-nav-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.screen === screen);
    });
  }

  function renderCurrentScreen() {
    const screen = state.screens[state.screenIndex];

    const labels = {
      os: 'ORDENS DE SERVIÇO',
      preventivas: 'PREVENTIVAS',
      equipe: 'EQUIPE EM OPERAÇÃO',
      galeria: 'GALERIA DE FECHAMENTO DAS OS',
      alertas: 'ALERTAS OPERACIONAIS'
    };

    const label = $('tvScreenLabel');
    if (label) label.textContent = labels[screen] || 'MODO TV';

    setActiveNav(screen);

    if (screen === 'os') renderOS();
    if (screen === 'preventivas') renderPreventivas();
    if (screen === 'equipe') renderEquipe();
    if (screen === 'galeria') renderGaleria();
    if (screen === 'alertas') renderAlertas();
  }

  function renderOS() {
    const data = state.data || {};
    const os = data.os || [];
    const perf = data.performance || {};

    $('tvContent').innerHTML = `
      <section class="tv-grid tv-grid-os">
        <div class="tv-card tv-main-card tv-appear">
          <div class="tv-card-title">
            <div>
              <h2>🔧 Ordens de Serviço</h2>
              <p>Monitoramento em tempo real da manutenção</p>
            </div>
            <span class="tv-pill">Atualizado em tempo real</span>
          </div>

          <div class="tv-table-wrap">
            <table class="tv-table">
              <thead>
                <tr>
                  <th>OS</th>
                  <th>Equipamento</th>
                  <th>Responsável</th>
                  <th>Status</th>
                  <th>Prioridade</th>
                  <th>Tempo</th>
                </tr>
              </thead>
              <tbody>
                ${os.map(item => `
                  <tr class="${item.isNew ? 'tv-row-new' : ''}">
                    <td><strong>${escapeHtml(item.numero)}</strong></td>
                    <td class="tv-equipment">${escapeHtml(item.equipamento)}</td>
                    <td>${escapeHtml(item.responsavel)}</td>
                    <td>${statusBadge(item.status)}</td>
                    <td>${prioridadeBadge(item.prioridade)}</td>
                    <td class="tv-time">◷ ${escapeHtml(item.tempo)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <aside class="tv-side tv-appear">
          <div class="tv-stat-row">
            <div class="tv-card tv-stat-card">
              <span>OS ABERTAS</span>
              <strong>${Number(perf.abertas || 0) + Number(perf.andamento || 0) + Number(perf.pausadas || 0)}</strong>
            </div>

            <div class="tv-card tv-stat-card danger">
              <span>OS CRÍTICAS</span>
              <strong>${Number(perf.criticas || 0)}</strong>
            </div>
          </div>

          <div class="tv-card tv-chart-card">
            <div class="tv-card-title compact">
              <h3>Status das OS</h3>
            </div>
            <canvas id="statusChart" width="360" height="220"></canvas>
            <div id="statusLegend" class="tv-chart-legend"></div>
          </div>

          <div class="tv-card tv-chart-card">
            <div class="tv-card-title compact">
              <h3>OS por Equipamento</h3>
            </div>
            <canvas id="equipChart" width="420" height="210"></canvas>
          </div>
        </aside>
      </section>
    `;

    drawDoughnut('statusChart', perf.statusChart || [], 'statusLegend');
    drawBarChart('equipChart', perf.porEquipamento || []);
  }

  function renderPreventivas() {
    const preventivas = state.data?.preventivas || [];
    const atrasadas = preventivas.filter(p => p.status === 'ATRASADA').length;
    const pendentes = preventivas.filter(p => p.status === 'PENDENTE').length;
    const prazo = preventivas.filter(p => p.status === 'NO_PRAZO').length;

    $('tvContent').innerHTML = `
      <section class="tv-grid tv-grid-preventivas">
        <div class="tv-card tv-main-card tv-appear">
          <div class="tv-card-title">
            <div>
              <h2>🛠 Preventivas</h2>
              <p>Programação, atrasos e serviços pendentes</p>
            </div>
          </div>

          <div class="tv-mini-stats">
            <div><span>Atrasadas</span><strong>${atrasadas}</strong></div>
            <div><span>Pendentes</span><strong>${pendentes}</strong></div>
            <div><span>No prazo</span><strong>${prazo}</strong></div>
          </div>

          <div class="tv-table-wrap">
            <table class="tv-table">
              <thead>
                <tr>
                  <th>Tarefa</th>
                  <th>Equipamento</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                ${preventivas.map(p => `
                  <tr>
                    <td>${escapeHtml(p.tarefa)}</td>
                    <td class="tv-equipment">${escapeHtml(p.equipamento)}</td>
                    <td>${escapeHtml(p.dataPrevista)}</td>
                    <td>${statusBadge(p.status)}</td>
                    <td>${escapeHtml(p.responsavel)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <aside class="tv-side-single">
          ${renderWeatherCard()}
        </aside>
      </section>
    `;
  }

  function renderEquipe() {
    const mecanicos = state.data?.mecanicos || [];

    $('tvContent').innerHTML = `
      <section class="tv-grid">
        <div class="tv-card tv-main-card tv-appear">
          <div class="tv-card-title">
            <div>
              <h2>👷 Equipe de Manutenção</h2>
              <p>Mecânicos ativos, online e disponíveis para atendimento</p>
            </div>
          </div>

          <div class="tv-team-grid premium">
            ${mecanicos.map(m => `
              <article class="tv-mechanic premium ${m.status === 'ativo' ? 'is-working' : ''}">
                <img src="${escapeHtml(m.foto || config.defaultAvatar)}" onerror="this.src='${config.defaultAvatar}'">
                <div>
                  <strong>${escapeHtml(m.nome)}</strong>
                  <span>${escapeHtml(m.funcao || 'Mecânico')}</span>
                  <small>${escapeHtml(m.turno || 'Turno vigente')}</small>
                </div>
                <em>${m.status === 'ativo' ? 'Em OS' : 'Online'}</em>
              </article>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderGaleria() {
    const galeria = state.data?.galeria || [];

    $('tvContent').innerHTML = `
      <section class="tv-grid">
        <div class="tv-card tv-main-card tv-appear">
          <div class="tv-card-title">
            <div>
              <h2>📸 Galeria de Fechamento das OS</h2>
              <p>Registro visual dos serviços executados pela manutenção</p>
            </div>
          </div>

          <div class="tv-gallery premium">
            ${galeria.map(g => `
              <figure>
                <img src="${escapeHtml(g.imagem_url || config.galleryPlaceholder)}" onerror="this.src='${config.galleryPlaceholder}'">
                <figcaption>
                  <strong>${escapeHtml(g.os_numero || 'OS')}</strong>
                  <span>${escapeHtml(g.legenda || 'Fechamento de OS')}</span>
                </figcaption>
              </figure>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderAlertas() {
    const alertas = state.data?.alertas || [];

    $('tvContent').innerHTML = `
      <section class="tv-grid tv-grid-alertas">
        <div class="tv-card tv-main-card tv-appear">
          <div class="tv-card-title">
            <div>
              <h2>🚨 Alertas Operacionais</h2>
              <p>OS críticas, preventivas atrasadas e pontos de atenção</p>
            </div>
          </div>

          <div class="tv-alert-list">
            ${
              alertas.length
                ? alertas.map(a => `
                    <article class="tv-alert ${a.tipo === 'CRITICO' ? 'critical' : ''}">
                      <strong>${escapeHtml(a.titulo)}</strong>
                      <p>${escapeHtml(a.descricao)}</p>
                      <small>${escapeHtml(a.timestamp)}</small>
                    </article>
                  `).join('')
                : '<div class="tv-empty">✅ Nenhum alerta crítico no momento.</div>'
            }
          </div>
        </div>

        <aside class="tv-side-single">
          ${renderWeatherCard()}
        </aside>
      </section>
    `;
  }

  function renderWeatherCard() {
    const w = state.data?.weather || {};

    return `
      <div class="tv-card tv-weather-card premium">
        <div class="tv-card-title compact">
          <h3>${weatherIcon(w.codigo)} Previsão do Tempo</h3>
        </div>

        <div class="tv-weather-main">
          <strong>${escapeHtml(w.temp ?? '--')}°</strong>
          <div>
            <span>${escapeHtml(w.cidade || 'Feira de Santana')}</span>
            <small>${escapeHtml(w.condicao || 'Condição indisponível')}</small>
          </div>
        </div>

        <div class="tv-weather-meta">
          <span>Umidade: <strong>${escapeHtml(w.umidade ?? '--')}%</strong></span>
          <span>Vento: <strong>${escapeHtml(w.vento ?? '--')} km/h</strong></span>
        </div>

        <div class="tv-weather-days">
          ${(w.previsao || []).slice(0, 5).map(day => `
            <div>
              <span>${new Date(day.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
              <strong>${weatherIcon(day.codigo)}</strong>
              <small>${Math.round(day.min ?? 0)}° / ${Math.round(day.max ?? 0)}°</small>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderTicker() {
    const ticker = state.data?.ticker || [];
    const track = $('tvTickerTrack');

    if (!track) return;

    const html = ticker.map(t => `
      <span class="tv-ticker-item tipo-${escapeHtml(t.tipo)}">
        ${escapeHtml(t.texto)}
      </span>
    `).join('');

    track.innerHTML = html + html;
  }

  function checkCriticalLed() {
    const critical = (state.data?.os || []).find(o => o.prioridade === 'CRITICA' && o.status !== 'CONCLUIDA');

    const led = $('tvLed');
    const ledText = $('tvLedText');

    if (!led || !ledText) return;

    if (critical) {
      ledText.textContent = `🚨 ${critical.numero} crítica — ${critical.equipamento} — ${critical.responsavel}`;
      led.hidden = false;
    } else {
      led.hidden = true;
    }
  }

  function drawDoughnut(canvasId, data, legendId) {
    const canvas = $(canvasId);
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext('2d');
    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 20;
    const inner = radius * 0.56;

    let start = -Math.PI / 2;

    data.forEach(item => {
      const value = Number(item.value || 0);
      const angle = (value / total) * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = item.color || '#3b82f6';
      ctx.fill();

      start += angle;
    });

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    const legend = $(legendId);
    if (legend) {
      legend.innerHTML = data.map(item => `
        <span>
          <i style="background:${item.color}"></i>
          ${escapeHtml(item.label)}: <strong>${escapeHtml(item.value)}</strong>
        </span>
      `).join('');
    }
  }

  function drawBarChart(canvasId, data) {
    const canvas = $(canvasId);
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 34;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    const max = Math.max(...data.map(d => Number(d.total || 0)), 1);
    const barGap = 14;
    const barWidth = Math.max(24, (chartWidth - barGap * (data.length - 1)) / data.length);

    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    data.forEach((item, index) => {
      const x = padding + index * (barWidth + barGap);
      const h = (Number(item.total || 0) / max) * chartHeight;
      const y = padding + chartHeight - h;

      const gradient = ctx.createLinearGradient(0, y, 0, y + h);
      gradient.addColorStop(0, '#60a5fa');
      gradient.addColorStop(1, '#2563eb');

      ctx.fillStyle = gradient;
      roundedRect(ctx, x, y, barWidth, h, 6);
      ctx.fill();

      ctx.fillStyle = getCssVar('--tv-muted') || '#94a3b8';
      ctx.fillText(String(item.total), x + barWidth / 2, y - 10);

      const label = String(item.equipamento || '').slice(0, 12);
      ctx.fillText(label, x + barWidth / 2, canvas.height - 14);
    });
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function goToScreen(screen) {
    const index = state.screens.indexOf(screen);
    if (index < 0) return;

    state.screenIndex = index;
    state.rotationStartedAt = Date.now();
    state.pausedUntil = Date.now() + 20000;

    renderCurrentScreen();
  }

  function startRotation() {
    setInterval(() => {
      if (Date.now() < state.pausedUntil) return;

      state.screenIndex = (state.screenIndex + 1) % state.screens.length;
      state.rotationStartedAt = Date.now();
      renderCurrentScreen();
    }, config.rotationMs || 30000);

    setInterval(() => {
      const progress = $('tvProgress');
      if (!progress) return;

      const elapsed = Date.now() - state.rotationStartedAt;
      const percent = Math.min(100, (elapsed / (config.rotationMs || 30000)) * 100);

      progress.style.width = `${percent}%`;
    }, 500);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        showToast('Modo tela cheia ativado');
      } else {
        await document.exitFullscreen();
        showToast('Modo tela cheia desativado');
      }
    } catch (err) {
      showToast('Não foi possível alterar tela cheia');
    }
  }

  function bindEvents() {
    $('tvThemeToggle')?.addEventListener('click', toggleTheme);
    $('tvFullscreenBtn')?.addEventListener('click', toggleFullscreen);

    $('tvLedClose')?.addEventListener('click', () => {
      const led = $('tvLed');
      if (led) led.hidden = true;
    });

    document.querySelectorAll('.tv-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => goToScreen(btn.dataset.screen));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        state.screenIndex = (state.screenIndex + 1) % state.screens.length;
        state.rotationStartedAt = Date.now();
        state.pausedUntil = Date.now() + 20000;
        renderCurrentScreen();
      }

      if (event.key === 'ArrowLeft') {
        state.screenIndex = (state.screenIndex - 1 + state.screens.length) % state.screens.length;
        state.rotationStartedAt = Date.now();
        state.pausedUntil = Date.now() + 20000;
        renderCurrentScreen();
      }

      if (event.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }

      if (event.key.toLowerCase() === 't') {
        toggleTheme();
      }
    });
  }

  function init() {
    setTheme();
    bindEvents();
    startClock();
    loadSnapshot();
    startRotation();

    setInterval(loadSnapshot, config.refreshMs || 15000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
