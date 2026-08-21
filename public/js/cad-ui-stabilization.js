function ensureUiStabilizationStyles() {
  if (document.querySelector('link[data-cad-ui-stabilization]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/cad-ui-stabilization.css?v=20260821-ui-v1';
  link.dataset.cadUiStabilization = '1';
  document.head.appendChild(link);
}

function makeGroup(title, nodes) {
  const valid = nodes.filter(Boolean);
  if (!valid.length) return null;
  const section = document.createElement('section');
  section.className = 'cad-tool-drawer-group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const body = document.createElement('div');
  body.className = 'cad-tool-drawer-group-body';
  valid.forEach((node) => body.appendChild(node));
  section.append(heading, body);
  return section;
}

function setupDrawer() {
  const page = document.getElementById('cadMlightPage');
  const appbar = page?.querySelector('.cad-mlight-appbar');
  const main = page?.querySelector('.cad-mlight-main');
  const bar = page?.querySelector('.cad-mlight-fabbar');
  if (!page || !appbar || !main || !bar) return false;
  if (bar.dataset.stabilized === '1') return true;

  ensureUiStabilizationStyles();
  bar.dataset.stabilized = '1';
  bar.id = 'cadToolDrawer';
  bar.classList.add('cad-tools-drawer');
  bar.setAttribute('aria-label', 'Ferramentas do desenho');

  const oldTitle = bar.querySelector('.cad-mlight-fabbar-title');
  oldTitle?.remove();
  bar.querySelectorAll('.cad-round3-divider').forEach((node) => node.remove());

  const drawerHead = document.createElement('div');
  drawerHead.className = 'cad-tool-drawer-head';
  drawerHead.innerHTML = '<div><small>CAD MECÂNICO</small><strong>Ferramentas</strong></div><button id="cadToolDrawerClose" type="button" aria-label="Fechar ferramentas">×</button>';

  const drawerBody = document.createElement('div');
  drawerBody.className = 'cad-tool-drawer-body';

  const byId = (id) => document.getElementById(id);
  const groups = [
    makeGroup('CRIAR E COTAR', [
      byId('mlightFlangeBtn'),
      byId('mlightDiscBtn'),
      byId('mlightShaftBtn'),
      byId('mlightAutoDimBtn')
    ]),
    makeGroup('FABRICAÇÃO', [
      byId('mlightSheetBtn'),
      byId('mlightCenterMarksBtn'),
      byId('mlightSurfaceBtn'),
      byId('mlightToleranceBtn'),
      byId('mlightThreadBtn'),
      byId('mlightKeywayBtn'),
      byId('mlightSectionBtn'),
      byId('mlightChamferBtn')
    ]),
    makeGroup('VISTAS E ANÁLISE', [
      byId('mlightProjectedViewsBtn'),
      byId('mlightPaperLayoutBtn'),
      byId('mlightTechAnalysisBtn'),
      byId('mlightPythonBadge')
    ]),
    makeGroup('BIBLIOTECA E PRODUÇÃO', [
      byId('mlightLibraryBtn'),
      byId('mlightGdtBtn'),
      byId('mlightNestingBtn')
    ]),
    makeGroup('VISTA', [byId('mlightZoomExtentsBtn')])
  ].filter(Boolean);

  groups.forEach((group) => drawerBody.appendChild(group));

  for (const child of [...bar.children]) {
    if (child === drawerHead || child === drawerBody) continue;
    if (child.classList?.contains('cad-round4-actions') && !child.children.length) child.remove();
  }

  bar.replaceChildren(drawerHead, drawerBody);

  const toggle = document.createElement('button');
  toggle.id = 'cadToolDrawerToggle';
  toggle.className = 'cad-mlight-action cad-tools-toggle';
  toggle.type = 'button';
  toggle.innerHTML = '☰ <span>Ferramentas</span>';
  toggle.setAttribute('aria-controls', 'cadToolDrawer');
  toggle.setAttribute('aria-expanded', 'false');

  const spacer = appbar.querySelector('.cad-mlight-spacer');
  appbar.insertBefore(toggle, spacer || null);

  const backdrop = document.createElement('button');
  backdrop.id = 'cadToolDrawerBackdrop';
  backdrop.className = 'cad-tool-drawer-backdrop';
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Fechar ferramentas');
  main.appendChild(backdrop);

  const back = appbar.querySelector('.cad-mlight-back');
  if (back) {
    back.href = '/desenho-tecnico';
    back.title = 'Voltar à Central de Desenhos';
    back.setAttribute('aria-label', 'Voltar à Central de Desenhos');
  }

  const floating = page.querySelector('.cad-mlight-floating-tools');
  if (floating && !floating.children.length) floating.remove();

  const setOpen = (open) => {
    page.classList.toggle('cad-tools-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    bar.setAttribute('aria-hidden', open ? 'false' : 'true');
    try { localStorage.setItem('cad2d.toolsDrawerOpen', open ? '1' : '0'); } catch (_error) {}
  };

  let initialOpen = false;
  try { initialOpen = localStorage.getItem('cad2d.toolsDrawerOpen') === '1'; } catch (_error) {}
  if (window.innerWidth <= 1180) initialOpen = false;
  setOpen(initialOpen);

  toggle.addEventListener('click', () => setOpen(!page.classList.contains('cad-tools-open')));
  drawerHead.querySelector('#cadToolDrawerClose')?.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && page.classList.contains('cad-tools-open')) setOpen(false);
  });

  page.dataset.uiStabilized = '1';
  return true;
}

function hideLegacyEditor() {
  document.querySelectorAll('.cad-fullscreen').forEach((node) => {
    if (node.closest('#cadMlightPage')) return;
    node.setAttribute('aria-hidden', 'true');
    node.style.display = 'none';
  });
}

function init() {
  hideLegacyEditor();
  setupDrawer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.addEventListener('cad:round4-ready', init);
