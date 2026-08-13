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
  if (root.dataset.tvMode === 'true') setInterval(() => location.reload(), 60000);
})();
