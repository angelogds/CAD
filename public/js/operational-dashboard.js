(() => {
  const root = document.querySelector('.operational-dashboard');
  if (!root) return;
  const rows = [...root.querySelectorAll('#os tbody tr[data-status]')];
  const filterBox = root.querySelector('.active-filter');
  const applyFilter = (filter) => {
    rows.forEach(row => { const status=row.dataset.status; row.hidden = filter==='atrasadas' ? row.dataset.overdue!=='true' : filter==='criticas' ? row.dataset.critical!=='true' : filter==='pausadas' ? status!=='PAUSADA' : filter==='andamento' ? !['ANDAMENTO','EM_ANDAMENTO'].includes(status) : filter==='abertas' ? !['ABERTA','AGUARDANDO_EQUIPE'].includes(status) : false; });
    if (filterBox) { filterBox.hidden=!filter; filterBox.querySelector('strong').textContent=filter; }
    root.querySelector('#os')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  root.querySelectorAll('[data-target]').forEach(button => button.addEventListener('click', () => { const target=button.dataset.target; if(target==='os') applyFilter(button.dataset.filter); else root.querySelector(`#${target}`)?.scrollIntoView({behavior:'smooth'}); }));
  root.querySelectorAll('.os-chart button').forEach(button => button.addEventListener('click', () => applyFilter(button.dataset.filter)));
  filterBox?.querySelector('button')?.addEventListener('click', () => applyFilter(''));
  document.querySelector('#opRefresh')?.addEventListener('click', () => location.reload());

  const demandSection = root.querySelector('#demandas');
  const normalizeLabel = (value) => String(value || '-').replaceAll('_', ' ');

  const ensureDemandStyles = () => {
    if (document.querySelector('link[data-dashboard-demandas-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/dashboard-demandas.css?v=20260903a';
    link.dataset.dashboardDemandasCss = 'true';
    document.head.appendChild(link);
  };

  const appendTag = (parent, text, variant = '') => {
    const tag = document.createElement('span');
    tag.className = `dashboard-demand-tag ${variant}`.trim();
    tag.textContent = text;
    parent.appendChild(tag);
  };

  const renderDemandas = (items) => {
    if (!demandSection) return;
    demandSection.classList.add('dashboard-demandas-enhanced');
    demandSection.querySelector('.dashboard-demand-list')?.remove();

    const currentEmpty = demandSection.querySelector('.empty-state');
    if (items.length && currentEmpty) currentEmpty.hidden = true;

    const wrap = document.createElement('div');
    wrap.className = 'dashboard-demand-list';
    wrap.dataset.dashboardDemandas = 'loaded';

    const heading = document.createElement('div');
    heading.className = 'dashboard-demand-list-heading';
    const headingText = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'PRINCIPAIS DEMANDAS EM ACOMPANHAMENTO';
    const subtitle = document.createElement('small');
    subtitle.textContent = 'Até 5 prioridades, considerando andamento, solicitações abertas e criticidade.';
    headingText.append(title, subtitle);
    const count = document.createElement('span');
    count.textContent = `${items.length}/5`;
    heading.append(headingText, count);
    wrap.appendChild(heading);

    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'dashboard-demand-empty';
      empty.textContent = 'Nenhuma demanda ativa disponível para acompanhamento.';
      wrap.appendChild(empty);
      demandSection.appendChild(wrap);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement('article');
      row.className = 'dashboard-demand-row';

      const main = document.createElement('div');
      main.className = 'dashboard-demand-main';
      const demandLink = document.createElement('a');
      demandLink.href = `/demandas/${Number(item.id)}`;
      demandLink.textContent = `#${Number(item.id)} · ${item.titulo || 'Demanda'}`;
      const context = document.createElement('small');
      const contextParts = [item.equipamento_nome, item.categoria ? normalizeLabel(item.categoria) : null].filter(Boolean);
      context.textContent = contextParts.length ? contextParts.join(' · ') : 'Demanda operacional';
      main.append(demandLink, context);

      const status = document.createElement('div');
      status.className = 'dashboard-demand-status';
      appendTag(status, normalizeLabel(item.prioridade || 'NORMAL'), ['URGENTE','CRITICA','CRÍTICA','ALTA'].includes(String(item.prioridade || '').toUpperCase()) ? 'priority' : '');
      appendTag(status, normalizeLabel(item.status), String(item.status || '').toUpperCase() === 'PARADA' ? 'stopped' : 'status');

      const flow = document.createElement('div');
      flow.className = 'dashboard-demand-flow';
      if (Number(item.solicitacoes_ativas || 0) > 0) {
        const sol = document.createElement('span');
        const numero = item.solicitacao_numero || item.solicitacao_id;
        sol.className = 'flow-active';
        sol.textContent = `${Number(item.solicitacoes_ativas)} solicitação(ões) ativa(s)${numero ? ` · #${numero}` : ''}`;
        flow.appendChild(sol);
        if (item.solicitacao_status) {
          const solStatus = document.createElement('small');
          solStatus.textContent = normalizeLabel(item.solicitacao_status);
          flow.appendChild(solStatus);
        }
      } else {
        const noSol = document.createElement('span');
        noSol.textContent = 'Sem solicitação aberta';
        flow.appendChild(noSol);
      }
      if (item.os_ativa_id) {
        const os = document.createElement('a');
        os.href = `/os/${Number(item.os_ativa_id)}`;
        os.textContent = `OS #${Number(item.os_ativa_id)} · ${normalizeLabel(item.os_ativa_status)}`;
        flow.appendChild(os);
      }

      const action = document.createElement('a');
      action.className = 'dashboard-demand-action';
      action.href = `/demandas/${Number(item.id)}`;
      action.textContent = 'Abrir →';
      action.setAttribute('aria-label', `Abrir demanda ${Number(item.id)}`);

      row.append(main, status, flow, action);
      wrap.appendChild(row);
    });

    demandSection.appendChild(wrap);
  };

  const loadDemandas = async () => {
    if (!demandSection) return;
    ensureDemandStyles();
    try {
      const response = await fetch('/demandas/dashboard-resumo.json', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (response.status === 401 || response.status === 403) {
        demandSection.querySelector('.card-heading a')?.setAttribute('hidden', 'hidden');
        return;
      }
      if (!response.ok) return;
      const payload = await response.json();
      renderDemandas(Array.isArray(payload?.items) ? payload.items.slice(0, 5) : []);
    } catch (_error) {
      // O resumo numérico server-side permanece disponível caso a consulta detalhada falhe.
    }
  };

  loadDemandas();
  if (root.dataset.tvMode === 'true') setInterval(() => location.reload(), 60000);
})();
