/* Only the installed Android client receives the card navigation. */
(() => {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'android') return;
  const app = document.getElementById('appRoot');
  const sidebar = app?.querySelector('.sidebar');
  const toggle = document.getElementById('sidebarToggle');
  if (!sidebar || !toggle) return;

  document.documentElement.classList.add('native-android');
  const phone = window.matchMedia('(max-width: 980px)');
  const shapes = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    tool: '<path d="m14 6 4 4m-9 3-6 6 2 2 6-6M14 3a6 6 0 0 0-6 8l5 5a6 6 0 0 0 8-6l-4 3-6-6z"/>',
    check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 13l3 3 5-6"/>',
    chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V7a5 5 0 0 1 5-5h5a8 8 0 0 1 8 9Z"/><path d="M7 8h10M7 12h7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3"/>',
    box: '<path d="m3 7 9-5 9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10M7 4l10 6"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',
    plan: '<path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h5"/>',
    ruler: '<path d="m3 17 14-14 4 4L7 21ZM11 9l2 2M15 5l2 2M7 13l2 2"/>',
  };
  const icons = {
    '/dashboard': 'grid', '/equipamentos': 'tool', '/os': 'check', '/chat-os': 'chat',
    '/preventivas': 'calendar', '/lubrificacao': 'tool', '/demandas': 'plan',
    '/solicitacoes/minhas': 'plan', '/compras/solicitacoes': 'box', '/fornecedores': 'people',
    '/almoxarifado/recebimentos': 'box', '/estoque': 'box', '/motores': 'tool',
    '/avisos': 'chat', '/escala': 'calendar', '/rh': 'people', '/meu-portal': 'people',
    '/inspecao': 'check', '/tracagem': 'ruler', '/desenho-tecnico': 'ruler',
    '/academia': 'plan', '/ai/chat': 'chat', '/pcm': 'calendar', '/usuarios': 'people',
  };
  sidebar.querySelectorAll('.nav > .nav-item').forEach(link => {
    const shortLabels = {
      '/dashboard/diretoria/manutencao': 'Desempenho',
      '/dashboard/diretoria/compras': 'Gestão de compras',
    };
    const label = link.querySelector('.nav-label');
    const shortLabel = shortLabels[link.getAttribute('href')];
    if (label && shortLabel && phone.matches) {
      link.setAttribute('aria-label', label.textContent);
      link.title = label.textContent;
      label.textContent = shortLabel;
    }
    const icon = document.createElement('span');
    icon.className = 'native-menu-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (shapes[icons[link.getAttribute('href')]] || shapes.grid) + '</svg>';
    link.prepend(icon);
    if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
  });

  sidebar.id ||= 'mainSidebar';
  toggle.setAttribute('aria-controls', sidebar.id);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'native-menu-close';
  close.setAttribute('aria-label', 'Fechar menu');
  close.textContent = '×';
  sidebar.querySelector('.sidebar-title').append(close);
  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'native-menu-backdrop';
  backdrop.setAttribute('aria-label', 'Fechar menu');
  backdrop.tabIndex = -1;
  backdrop.hidden = true;
  app.append(backdrop);
  const main = app.querySelector('.main');
  let previousOverflow = '';
  let locked = false;
  const isOpen = () => phone.matches && app.classList.contains('mobile-sidebar-open');
  function setOpen(open, restoreFocus = true) {
    open = Boolean(open && phone.matches);
    if (phone.matches) app.classList.remove('sidebar-collapsed');
    app.classList.toggle('mobile-sidebar-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    backdrop.hidden = !open;
    sidebar.inert = phone.matches && !open;
    if (main) main.inert = open;
    if (open && !locked) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      locked = true;
    } else if (!open && locked) {
      document.body.style.overflow = previousOverflow;
      locked = false;
    }
    if (open) close.focus();
    else if (restoreFocus && phone.matches) toggle.focus();
  }
  toggle.addEventListener('click', event => {
    if (!phone.matches) return;
    event.stopImmediatePropagation();
    setOpen(!isOpen());
  }, true);
  close.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  sidebar.addEventListener('click', event => {
    if (event.target.closest('a[href]') && phone.matches) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (!isOpen()) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key === 'Tab') {
      const links = [...sidebar.querySelectorAll('button, a[href]')].filter(el => el.getClientRects().length);
      const first = links[0], last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  phone.addEventListener('change', () => setOpen(false, false));
  const nativeApp = cap.Plugins?.App || cap.registerPlugin?.('App');
  nativeApp?.addListener('backButton', event => {
    if (isOpen()) setOpen(false);
    else if (event.canGoBack) window.history.back();
    else nativeApp.minimizeApp?.();
  });
  setOpen(false, false);
})();
