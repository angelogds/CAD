(() => {
  const config = window.CG_TV_CONFIG || {};

  const state = {
    data: null,
    screenIndex: 0,
    screens: ['os', 'preventivas', 'equipe', 'alertas'],
    rotationStartedAt: Date.now(),
    theme: localStorage.getItem('cg-tv-theme') || 'dark',
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

  function resolvePhoto(photo) {
    const value = String(photo || '').trim();
    if (!value) return config.defaultAvatar || '/IMG/logo_menu.png.png';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) return value;
    if (value.startsWith('uploads/')) return `/${value}`;
    return `/uploads/users/${value}`;
  }

  function initTheme() {
    document.documentElement.classList.toggle('tv-theme-light', state.theme === 'light');
    document.documentElement.classList.toggle('tv-theme-dark', state.theme !== 'light');

    const icon = $('tvThemeIcon');
    const text = $('tvThemeText');
    if (icon) icon.textContent = state.theme === 'light' ? '🌙' : '☀️';
    if (text) text.textContent = state.theme === 'light' ? 'Modo escuro' : 'Modo claro';
  }

  function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('cg-tv-theme', state.theme);
    initTheme();
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
          second: '2-digit',
        });
      }

      if (date) {
        date.textContent = now.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        });
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  async function loadSnapshot() {
    try {
      const response = await fetch(config.snapshotUrl || '/api/tv/snapshot', {
        headers: { Accept: 'application/json' },
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || 'Erro no snapshot');

      state.data = json.data;
      renderTop();
      renderTicker();
      renderCurrentScreen();
      checkCriticalLed();
    } catch (err) {
      console.error('[TV] erro ao carregar snapshot:', err);
      const content = $('tvContent');
      if (content) {
        content.innerHTML = `<section class="tv-error"><h1>Erro ao carregar Modo TV</h1><p>${escapeHtml(err.message)}</p></section>`;
      }
    }
  }

  function renderTop() {
    const data = state.data || {};
    const mecanicos = data.mecanicos || [];
    const avatarBox = $('tvAvatars');

    if (avatarBox) {
      avatarBox.innerHTML = mecanicos
        .slice(0, 5)
        .map((m) => `
          <div class="tv-avatar ${m.status === 'ativo' ? 'is-active' : ''}" title="${escapeHtml(m.nome)}">
            <img src="${escapeHtml(resolvePhoto(m.foto))}" onerror="this.src='${config.defaultAvatar}'">
            <span></span>
          </div>
        `)
        .join('');
    }

    const weatherMini = $('tvWeatherMini');
    if (weatherMini && data.weather) {
      weatherMini.textContent = `⛅ ${data.weather.temp}° ${data.weather.cidade || 'Feira'}`;
    }
  }

  function statusBadge(status) {
    const label = {
      ABERTA: '⚠ ABERTA',
      EM_ANDAMENTO: '🔧 EM ANDAMENTO',
      PAUSADA: '⏸ PAUSADA',
      CONCLUIDA: '✅ CONCLUÍDA',
    }[status] || status;

    return `<span class="tv-badge status-${String(status).toLowerCase()}">${label}</span>`;
  }

  function prioridadeBadge(prioridade) {
    const label = prioridade === 'CRITICA' ? 'CRÍTICA' : prioridade;
    return `<span class="tv-badge prio-${String(prioridade).toLowerCase()}">${label}</span>`;
  }

  function renderCurrentScreen() {
    const screen = state.screens[state.screenIndex];
    const labels = {
      os: 'ORDENS DE SERVIÇO',
      preventivas: 'PREVENTIVAS',
      equipe: 'EQUIPE E GALERIA',
      alertas: 'ALERTAS',
    };

    const label = $('tvScreenLabel');
    if (label) label.textContent = labels[screen] || 'MODO TV';

    if (screen === 'os') renderOS();
    if (screen === 'preventivas') renderPreventivas();
    if (screen === 'equipe') renderEquipe();
    if (screen === 'alertas') renderAlertas();
  }

  function renderOS() {
    const data = state.data || {};
    const os = data.os || [];
    const perf = data.performance || {};

    $('tvContent').innerHTML = `
      <section class="tv-grid tv-grid-os">
        <div class="tv-card tv-main-card">
          <div class="tv-card-title"><h2>🔧 Ordens de Serviço</h2><span>Atualizado em tempo real</span></div>
          <div class="tv-table-wrap">
            <table class="tv-table">
              <thead><tr><th>OS</th><th>Equipamento</th><th>Responsável</th><th>Status</th><th>Prioridade</th><th>Tempo</th></tr></thead>
              <tbody>
                ${os
                  .map(
                    (item) => `<tr class="${item.isNew ? 'tv-row-new' : ''}">
                    <td><strong>${escapeHtml(item.numero)}</strong></td>
                    <td>${escapeHtml(item.equipamento)}</td>
                    <td>${escapeHtml(item.responsavel)}</td>
                    <td>${statusBadge(item.status)}</td>
                    <td>${prioridadeBadge(item.prioridade)}</td>
                    <td>${escapeHtml(item.tempo)}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <aside class="tv-side">
          <div class="tv-card tv-stat-card"><span>OS ABERTAS</span><strong>${perf.abertas ?? 0}</strong></div>
          <div class="tv-card tv-stat-card danger"><span>OS CRÍTICAS</span><strong>${perf.criticas ?? 0}</strong></div>
          <div class="tv-card tv-stat-card success"><span>OS CONCLUÍDAS</span><strong>${perf.concluidas ?? 0}</strong></div>
          <div class="tv-card tv-weather-card">
            <h3>⛅ Tempo</h3><strong>${data.weather?.temp ?? '--'}°</strong>
            <p>${escapeHtml(data.weather?.cidade || 'Feira de Santana')}</p>
            <small>${escapeHtml(data.weather?.condicao || 'Aguardando previsão')}</small>
          </div>
        </aside>
      </section>
    `;
  }

  function renderPreventivas() {
    const preventivas = state.data?.preventivas || [];

    $('tvContent').innerHTML = `
      <section class="tv-grid">
        <div class="tv-card tv-main-card">
          <div class="tv-card-title"><h2>🛠 Preventivas</h2><span>Programação e atrasos</span></div>
          <div class="tv-table-wrap">
            <table class="tv-table">
              <thead><tr><th>Tarefa</th><th>Equipamento</th><th>Data</th><th>Status</th><th>Responsável</th></tr></thead>
              <tbody>
                ${preventivas
                  .map(
                    (p) => `<tr>
                    <td>${escapeHtml(p.tarefa)}</td>
                    <td>${escapeHtml(p.equipamento)}</td>
                    <td>${escapeHtml(p.dataPrevista)}</td>
                    <td><span class="tv-badge status-${String(p.status).toLowerCase()}">${escapeHtml(p.status)}</span></td>
                    <td>${escapeHtml(p.responsavel)}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  function renderEquipe() {
    const mecanicos = state.data?.mecanicos || [];
    const galeria = state.data?.galeria || [];

    $('tvContent').innerHTML = `
      <section class="tv-grid tv-grid-half">
        <div class="tv-card">
          <div class="tv-card-title"><h2>👷 Mecânicos</h2><span>Equipe atual</span></div>
          <div class="tv-team-grid">
            ${mecanicos
              .map(
                (m) => `<div class="tv-mechanic">
                <img src="${escapeHtml(resolvePhoto(m.foto))}" onerror="this.src='${config.defaultAvatar}'">
                <div><strong>${escapeHtml(m.nome)}</strong><span>${escapeHtml(m.funcao || 'Mecânico')}</span><small>${escapeHtml(m.turno || 'Turno vigente')}</small></div>
              </div>`
              )
              .join('')}
          </div>
        </div>

        <div class="tv-card">
          <div class="tv-card-title"><h2>📸 Galeria de Fechamento de OS</h2><span>Fotos dos serviços concluídos</span></div>
          <div class="tv-gallery">
            ${galeria
              .map(
                (g) => `<figure>
                <img src="${escapeHtml(g.imagem_url || config.galleryPlaceholder)}" onerror="this.src='${config.galleryPlaceholder}'">
                <figcaption>${escapeHtml(g.legenda)}</figcaption>
              </figure>`
              )
              .join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderAlertas() {
    const alertas = state.data?.alertas || [];
    $('tvContent').innerHTML = `
      <section class="tv-grid">
        <div class="tv-card tv-main-card">
          <div class="tv-card-title"><h2>🚨 Alertas Operacionais</h2><span>OS críticas e preventivas atrasadas</span></div>
          <div class="tv-alert-list">
            ${
              alertas.length
                ? alertas
                    .map(
                      (a) => `<div class="tv-alert"><strong>${escapeHtml(a.titulo)}</strong><p>${escapeHtml(a.descricao)}</p><small>${escapeHtml(a.timestamp)}</small></div>`
                    )
                    .join('')
                : '<div class="tv-empty">Nenhum alerta crítico no momento.</div>'
            }
          </div>
        </div>
      </section>
    `;
  }

  function renderTicker() {
    const ticker = state.data?.ticker || [];
    const track = $('tvTickerTrack');
    if (!track) return;

    const html = ticker
      .map((t) => `<span class="tv-ticker-item tipo-${escapeHtml(t.tipo)}">${escapeHtml(t.texto)}</span>`)
      .join('');

    track.innerHTML = html + html;
  }

  function checkCriticalLed() {
    const critical = (state.data?.os || []).find((o) => o.prioridade === 'CRITICA' && o.status !== 'CONCLUIDA');

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

  function startRotation() {
    setInterval(() => {
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

  function bindEvents() {
    const themeBtn = $('tvThemeToggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const ledClose = $('tvLedClose');
    if (ledClose) {
      ledClose.addEventListener('click', () => {
        const led = $('tvLed');
        if (led) led.hidden = true;
      });
    }
  }

  function init() {
    initTheme();
    bindEvents();
    startClock();
    loadSnapshot();
    startRotation();
    setInterval(loadSnapshot, config.refreshMs || 15000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
