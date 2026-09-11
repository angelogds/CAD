(() => {
  const DASHBOARD_PATH = '/compras/solicitacoes';

  function isDashboard() {
    return window.location.pathname.replace(/\/$/, '') === DASHBOARD_PATH
      && Boolean(document.querySelector('.purchase-dashboard'));
  }

  function plural(value, singular, pluralText) {
    return Number(value) === 1 ? singular : pluralText;
  }

  function requestIdFromRow(row) {
    const href = row?.dataset?.href || row?.querySelector('a[href^="/compras/solicitacoes/"]')?.getAttribute('href') || '';
    const match = href.match(/^\/compras\/solicitacoes\/(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function ensureStyles() {
    if (document.querySelector('style[data-director-release-dashboard]')) return;
    const style = document.createElement('style');
    style.dataset.directorReleaseDashboard = '1';
    style.textContent = `
      .compras-summary.metric-grid{grid-template-columns:repeat(7,minmax(105px,1fr))}
      .director-release-metric{--metric-color:#16a34a!important;border-color:#86efac!important;background:linear-gradient(180deg,#f0fdf4 0%,#fff 100%)!important}
      .director-release-metric strong{color:#15803d!important}
      .director-release-panel{display:flex;align-items:center;justify-content:space-between;gap:18px;border:1px solid #86efac;border-left:5px solid #16a34a;background:linear-gradient(90deg,#ecfdf3 0%,#f8fffb 68%,#fff 100%);border-radius:14px;padding:14px 16px;box-shadow:0 6px 18px rgba(22,163,74,.08)}
      .director-release-panel-copy{display:grid;gap:3px;min-width:0}.director-release-panel-kicker{font-size:10px;font-weight:900;letter-spacing:.08em;color:#15803d}.director-release-panel h2{margin:0;font-size:16px;color:#14532d}.director-release-panel p{margin:0;color:#506078;font-size:12px}.director-release-panel-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .request-row.is-director-released{box-shadow:inset 5px 0 #16a34a;background:linear-gradient(90deg,#f0fdf4 0%,rgba(240,253,244,.55) 42%,#fff 100%)}
      .request-row.is-director-released.is-overdue{box-shadow:inset 5px 0 #16a34a;background:linear-gradient(90deg,#f0fdf4 0%,#fff7f7 100%)}
      .director-release-state{display:inline-flex!important;align-items:center;justify-content:flex-start;width:max-content;max-width:100%;gap:5px;border-radius:999px;padding:4px 9px;font-size:10px!important;font-weight:900!important;line-height:1.2;white-space:normal}
      .director-release-state.is-released{background:#dcfce7;color:#166534;border:1px solid #86efac}
      .director-release-state.is-waiting{background:#fffbeb;color:#92400e;border:1px solid #fde68a}
      .director-release-state.is-neutral{background:#f8fafc;color:#64748b;border:1px solid #e2e8f0}
      .director-release-note{color:#15803d!important;font-size:10px!important;font-weight:800!important}.director-release-buy{background:#15803d!important;color:#fff!important;border-color:#15803d!important;box-shadow:0 3px 10px rgba(21,128,61,.16)}
      .director-release-hidden{display:none!important}
      @media(max-width:1200px){.compras-summary.metric-grid{grid-template-columns:repeat(4,1fr)}}
      @media(max-width:850px){.director-release-panel{align-items:flex-start;flex-direction:column}.director-release-panel-actions{justify-content:flex-start}.compras-summary.metric-grid{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.append(style);
  }

  async function loadApproval(requestId) {
    try {
      const response = await fetch(`/compras/solicitacoes/${requestId}/aprovacao-itens.json`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) return null;
      const payload = await response.json();
      if (!payload?.ok) return null;
      return {
        approved: Number(payload.aprovados || 0),
        pending: Number(payload.pendentes || 0),
      };
    } catch (error) {
      console.warn('[compras-liberados] Falha ao consultar aprovação da solicitação', requestId, error?.message || error);
      return null;
    }
  }

  function appendReleaseState(row, state) {
    const flow = row.querySelector('.request-flow') || row.querySelector('.purchase-data') || row.querySelector('.request-main');
    if (!flow || flow.querySelector('.director-release-state')) return;

    const badge = document.createElement('span');
    badge.className = 'director-release-state';
    if (state.approved > 0) {
      badge.classList.add('is-released');
      badge.textContent = `✓ ${state.approved} ${plural(state.approved, 'item liberado', 'itens liberados')} para compra`;
    } else if (state.pending > 0) {
      badge.classList.add('is-waiting');
      badge.textContent = `⏳ ${state.pending} ${plural(state.pending, 'item aguardando', 'itens aguardando')} Diretoria`;
    } else {
      badge.classList.add('is-neutral');
      badge.textContent = 'Sem itens liberados no momento';
    }
    flow.append(badge);
  }

  function decorateReleasedRow(row, state) {
    row.dataset.directorApproved = String(state.approved);
    row.dataset.directorPending = String(state.pending);
    appendReleaseState(row, state);

    if (state.approved <= 0) return;
    row.classList.add('is-director-released');

    const purchaseData = row.querySelector('.purchase-data');
    if (purchaseData && !purchaseData.querySelector('.director-release-note')) {
      const note = document.createElement('small');
      note.className = 'director-release-note';
      note.textContent = `Diretoria liberou ${state.approved} ${plural(state.approved, 'item', 'itens')}. Ação do setor de Compras.`;
      purchaseData.append(note);
    }

    const open = row.querySelector('.row-actions > a.ui-btn, .row-actions > a');
    if (open) {
      open.classList.add('director-release-buy');
      open.textContent = state.approved === 1 ? 'Comprar item liberado' : `Comprar ${state.approved} liberados`;
      open.title = 'Abrir solicitação e efetuar a compra dos itens já aprovados pela Diretoria';
    }
  }

  function createMetric(releasedRequests, releasedItems) {
    const grid = document.querySelector('.compras-summary.metric-grid, .compras-summary');
    if (!grid || grid.querySelector('.director-release-metric')) return;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'metric-card director-release-metric';
    card.setAttribute('aria-label', 'Mostrar solicitações com itens liberados para compra');

    const label = document.createElement('span');
    label.textContent = 'LIBERADOS P/ COMPRA';
    const total = document.createElement('strong');
    total.textContent = String(releasedRequests);
    const hint = document.createElement('small');
    hint.textContent = releasedItems > 0
      ? `${releasedItems} ${plural(releasedItems, 'item aguardando compra', 'itens aguardando compra')}`
      : 'Nenhum item liberado visível';
    card.append(label, total, hint);
    card.addEventListener('click', () => toggleReleasedOnly(card));
    grid.append(card);
  }

  function toggleReleasedOnly(sourceButton) {
    const rows = [...document.querySelectorAll('.request-row')];
    const active = sourceButton.dataset.filterActive === '1';
    sourceButton.dataset.filterActive = active ? '0' : '1';
    sourceButton.classList.toggle('is-selected', !active);
    sourceButton.querySelector('small').textContent = active ? 'Clique para ver os liberados' : 'Filtro visual ativo';

    rows.forEach((row) => {
      row.classList.toggle('director-release-hidden', !active && Number(row.dataset.directorApproved || 0) <= 0);
    });

    document.querySelectorAll('.priority-section').forEach((section) => {
      const visible = [...section.querySelectorAll('.request-row')].some((row) => !row.classList.contains('director-release-hidden'));
      section.classList.toggle('director-release-hidden', !active && !visible);
    });
  }

  function createActionPanel(releasedRequests, releasedItems, pendingItems) {
    const anchor = document.querySelector('.attention-card');
    if (!anchor || document.querySelector('.director-release-panel')) return;

    const section = document.createElement('section');
    section.className = 'director-release-panel';
    const copy = document.createElement('div');
    copy.className = 'director-release-panel-copy';
    const kicker = document.createElement('span');
    kicker.className = 'director-release-panel-kicker';
    kicker.textContent = releasedItems > 0 ? 'AÇÃO NECESSÁRIA · COMPRAS' : 'ACOMPANHAMENTO DA DIRETORIA';
    const title = document.createElement('h2');
    title.textContent = releasedItems > 0
      ? 'Itens aprovados pela Diretoria aguardando compra'
      : 'Nenhum item liberado para compra nesta página';
    const text = document.createElement('p');
    text.textContent = releasedItems > 0
      ? `${releasedItems} ${plural(releasedItems, 'item aprovado', 'itens aprovados')} em ${releasedRequests} ${plural(releasedRequests, 'solicitação exibida', 'solicitações exibidas')} já podem ser comprados.${pendingItems > 0 ? ` Outros ${pendingItems} item(ns) ainda aguardam decisão da Diretoria.` : ''}`
      : (pendingItems > 0 ? `${pendingItems} item(ns) das solicitações exibidas ainda aguardam decisão da Diretoria.` : 'As solicitações exibidas não possuem itens aguardando ação de compra por aprovação da Diretoria.');
    copy.append(kicker, title, text);
    section.append(copy);

    if (releasedItems > 0) {
      const actions = document.createElement('div');
      actions.className = 'director-release-panel-actions';
      const first = document.createElement('button');
      first.type = 'button';
      first.className = 'ui-btn';
      first.textContent = 'Ir para o primeiro liberado';
      first.addEventListener('click', () => document.querySelector('.request-row.is-director-released')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      const only = document.createElement('button');
      only.type = 'button';
      only.className = 'ui-btn ui-btn--outline';
      only.textContent = 'Ver somente liberados';
      only.addEventListener('click', () => {
        const metric = document.querySelector('.director-release-metric');
        if (metric) toggleReleasedOnly(metric);
      });
      actions.append(first, only);
      section.append(actions);
    }

    anchor.insertAdjacentElement('beforebegin', section);
  }

  async function init() {
    if (!isDashboard()) return;
    ensureStyles();

    const rows = [...document.querySelectorAll('.request-row')];
    const requests = rows
      .map((row) => ({ row, requestId: requestIdFromRow(row) }))
      .filter((item) => item.requestId);
    if (!requests.length) return;

    const results = await Promise.all(requests.map(async ({ row, requestId }) => ({
      row,
      requestId,
      state: await loadApproval(requestId),
    })));

    let releasedRequests = 0;
    let releasedItems = 0;
    let pendingItems = 0;
    results.forEach(({ row, state }) => {
      if (!state) return;
      decorateReleasedRow(row, state);
      if (state.approved > 0) {
        releasedRequests += 1;
        releasedItems += state.approved;
      }
      pendingItems += state.pending;
    });

    createMetric(releasedRequests, releasedItems);
    createActionPanel(releasedRequests, releasedItems, pendingItems);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
