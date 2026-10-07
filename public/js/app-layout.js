// public/js/app-layout.js
(() => {
  const app = document.getElementById('appRoot');
  const btn = document.getElementById('sidebarToggle');
  const sidebar = app?.querySelector('.sidebar');
  if (!app || !btn || !sidebar) return;

  const breakpoint = window.matchMedia('(max-width: 980px)');
  const isMobile = () => breakpoint.matches;
  const allowedModes = new Set(['EXPANDED', 'COMPACT', 'AUTO']);
  const rawMode = String(app.dataset.sidebarMode || 'EXPANDED').toUpperCase();
  const preference = allowedModes.has(rawMode) ? rawMode : 'EXPANDED';
  const autoKey = 'cg.sidebar.auto.compact';

  const iconShapes = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    tool: '<path d="m14 6 4 4m-9 3-6 6 2 2 6-6M14 3a6 6 0 0 0-6 8l5 5a6 6 0 0 0 8-6l-4 3-6-6z"/>',
    check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 13l3 3 5-6"/>',
    chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V7a5 5 0 0 1 5-5h5a8 8 0 0 1 8 9Z"/><path d="M7 8h10M7 12h7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3"/>',
    box: '<path d="m3 7 9-5 9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10M7 4l10 6"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',
    plan: '<path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h5"/>',
    ruler: '<path d="m3 17 14-14 4 4L7 21ZM11 9l2 2M15 5l2 2M7 13l2 2"/>',
    monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z"/>',
  };

  const iconByHref = (href) => {
    const path = String(href || '').split('?')[0];
    if (path === '/dashboard') return 'grid';
    if (path.includes('diretoria')) return 'grid';
    if (path.startsWith('/equipamentos') || path.startsWith('/motores') || path.startsWith('/lubrificacao')) return 'tool';
    if (path.startsWith('/os') || path.startsWith('/preventivas') || path.startsWith('/inspecao')) return 'check';
    if (path.startsWith('/chat-os') || path.startsWith('/avisos') || path.startsWith('/ai')) return 'chat';
    if (path.startsWith('/escala') || path.startsWith('/pcm')) return 'calendar';
    if (path.startsWith('/almoxarifado') || path.startsWith('/estoque') || path.startsWith('/compras')) return 'box';
    if (path.startsWith('/fornecedores') || path.startsWith('/rh') || path.startsWith('/meu-portal') || path.startsWith('/usuarios')) return 'people';
    if (path.startsWith('/tracagem') || path.startsWith('/desenho-tecnico')) return 'ruler';
    if (path === '/tv') return 'monitor';
    if (path.startsWith('/academia')) return 'heart';
    return 'plan';
  };

  sidebar.querySelectorAll('.nav-item').forEach((link) => {
    if (link.querySelector('.shell-nav-icon')) return;
    const label = link.dataset.navLabel || link.querySelector('.nav-label')?.textContent?.trim() || 'Menu';
    link.dataset.navLabel = label;
    link.title = label;
    link.classList.add('has-shell-icon');
    const icon = document.createElement('span');
    icon.className = 'shell-nav-icon';
    icon.setAttribute('aria-hidden', 'true');
    const shape = iconShapes[iconByHref(link.getAttribute('href'))] || iconShapes.plan;
    icon.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + shape + '</svg>';
    link.prepend(icon);
  });

  const tooltip = document.createElement('div');
  tooltip.className = 'shell-sidebar-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

  const hideTooltip = () => {
    tooltip.hidden = true;
    tooltip.textContent = '';
  };

  const showTooltip = (link) => {
    if (isMobile() || !app.classList.contains('sidebar-compact')) return;
    const rect = link.getBoundingClientRect();
    tooltip.textContent = link.dataset.navLabel || link.title || '';
    tooltip.style.left = Math.round(rect.right + 10) + 'px';
    tooltip.style.top = Math.round(rect.top + (rect.height / 2)) + 'px';
    tooltip.hidden = false;
  };

  sidebar.querySelectorAll('.nav-item').forEach((link) => {
    link.addEventListener('mouseenter', () => showTooltip(link));
    link.addEventListener('mouseleave', hideTooltip);
    link.addEventListener('focus', () => showTooltip(link));
    link.addEventListener('blur', hideTooltip);
  });

  function setDesktopCompact(compact) {
    if (isMobile()) {
      app.classList.remove('sidebar-compact', 'sidebar-collapsed');
      hideTooltip();
      return;
    }
    app.classList.remove('sidebar-collapsed');
    app.classList.toggle('sidebar-compact', Boolean(compact));
    btn.setAttribute('aria-expanded', String(!compact));
    btn.setAttribute('aria-label', compact ? 'Expandir menu lateral' : 'Compactar menu lateral');
    if (!compact) hideTooltip();
  }

  function applyPreference() {
    if (isMobile()) {
      app.classList.remove('sidebar-compact', 'sidebar-collapsed');
      btn.setAttribute('aria-expanded', String(app.classList.contains('mobile-sidebar-open')));
      btn.setAttribute('aria-label', 'Mostrar ou ocultar menu');
      return;
    }
    app.classList.remove('mobile-sidebar-open');
    if (preference === 'COMPACT') {
      setDesktopCompact(true);
      return;
    }
    if (preference === 'AUTO') {
      setDesktopCompact(sessionStorage.getItem(autoKey) === '1');
      return;
    }
    setDesktopCompact(false);
  }

  btn.addEventListener('click', () => {
    if (isMobile()) {
      const open = !app.classList.contains('mobile-sidebar-open');
      app.classList.toggle('mobile-sidebar-open', open);
      btn.setAttribute('aria-expanded', String(open));
      return;
    }
    setDesktopCompact(!app.classList.contains('sidebar-compact'));
  });

  sidebar.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;

    if (isMobile()) {
      app.classList.remove('mobile-sidebar-open');
      btn.setAttribute('aria-expanded', 'false');
      return;
    }

    if (preference === 'AUTO') {
      sessionStorage.setItem(autoKey, '1');
      setDesktopCompact(true);
    } else if (preference === 'COMPACT') {
      setDesktopCompact(true);
    }
  });

  breakpoint.addEventListener('change', applyPreference);
  window.addEventListener('resize', hideTooltip);
  applyPreference();
})();
