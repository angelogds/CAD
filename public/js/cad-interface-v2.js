const CAD_INTERFACE_V2_STYLE_ID = 'cadInterfaceV2Style';
const CAD_INTERFACE_V2_STATE_PREFIX = 'cad2d.interfaceV2.group.';

function loadInterfaceV2Styles() {
  if (document.getElementById(CAD_INTERFACE_V2_STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = CAD_INTERFACE_V2_STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/css/cad-interface-v2.css?v=20260822-v1';
  document.head.appendChild(link);
}

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch (_error) { return null; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_error) {}
}

function slug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'grupo';
}

function upgradeAppbar(page) {
  const appbar = page.querySelector('.cad-mlight-appbar');
  if (!appbar || appbar.dataset.interfaceV2 === '1') return;
  appbar.dataset.interfaceV2 = '1';

  const engine = appbar.querySelector('#mlightCadStatus');
  if (engine) {
    engine.classList.add('cad-interface-engine');
    engine.title = engine.textContent || 'Status do motor CAD';
    const observer = new MutationObserver(() => {
      engine.title = engine.textContent || 'Status do motor CAD';
    });
    observer.observe(engine, { childList: true, characterData: true, subtree: true });
  }

  const importBtn = appbar.querySelector('#mlightDxfImportBtn');
  const exportBtn = appbar.querySelector('#mlightDxfExportBtn');
  const pdfLink = [...appbar.querySelectorAll('a.cad-mlight-action')].find((node) => /\/pdf(?:$|\?)/.test(node.getAttribute('href') || ''));

  if (importBtn || exportBtn || pdfLink) {
    const fileMenu = document.createElement('div');
    fileMenu.className = 'cad-interface-file-menu';
    fileMenu.innerHTML = `
      <button type="button" class="cad-mlight-action cad-interface-file-trigger" aria-expanded="false" aria-haspopup="menu">Arquivo <span aria-hidden="true">▾</span></button>
      <div class="cad-interface-file-popover" role="menu" hidden></div>`;
    const popover = fileMenu.querySelector('.cad-interface-file-popover');
    [importBtn, exportBtn, pdfLink].filter(Boolean).forEach((node) => {
      node.classList.add('cad-interface-file-action');
      node.setAttribute('role', 'menuitem');
      popover.appendChild(node);
    });

    const saveState = appbar.querySelector('#mlightSaveState');
    appbar.insertBefore(fileMenu, saveState || appbar.querySelector('#mlightSaveBtn') || null);

    const trigger = fileMenu.querySelector('.cad-interface-file-trigger');
    const setOpen = (open) => {
      popover.hidden = !open;
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      fileMenu.classList.toggle('is-open', open);
    };
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(popover.hidden);
    });
    document.addEventListener('pointerdown', (event) => {
      if (!popover.hidden && !fileMenu.contains(event.target)) setOpen(false);
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !popover.hidden) setOpen(false);
    });
  }

  const title = appbar.querySelector('.cad-mlight-title');
  if (title) title.title = title.textContent.replace(/\s+/g, ' ').trim();
}

function setDrawerGroupState(group, expanded, persist = true) {
  const toggle = group.querySelector('.cad-tool-group-toggle');
  const body = group.querySelector('.cad-tool-drawer-group-body');
  if (!toggle || !body) return;
  group.classList.toggle('is-collapsed', !expanded);
  body.hidden = !expanded;
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (persist) safeStorageSet(`${CAD_INTERFACE_V2_STATE_PREFIX}${group.dataset.groupKey}`, expanded ? '1' : '0');
}

function upgradeDrawer(page) {
  const drawer = page.querySelector('#cadToolDrawer');
  const head = drawer?.querySelector('.cad-tool-drawer-head');
  const body = drawer?.querySelector('.cad-tool-drawer-body');
  if (!drawer || !head || !body || drawer.dataset.interfaceV2 === '1') return;
  drawer.dataset.interfaceV2 = '1';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'cad-tool-search';
  searchWrap.innerHTML = `
    <span aria-hidden="true">⌕</span>
    <input id="cadToolSearchInput" type="search" placeholder="Buscar ferramenta…" autocomplete="off" aria-label="Buscar ferramenta no CAD">
    <button type="button" id="cadToolSearchClear" aria-label="Limpar busca" hidden>×</button>`;
  drawer.insertBefore(searchWrap, body);

  const groups = [...body.querySelectorAll('.cad-tool-drawer-group')];
  groups.forEach((group, index) => {
    const heading = group.querySelector('h3');
    const groupBody = group.querySelector('.cad-tool-drawer-group-body');
    if (!heading || !groupBody) return;
    const title = heading.textContent.trim();
    const key = slug(title);
    group.dataset.groupKey = key;
    const groupBodyId = `cadToolGroup-${key}`;
    groupBody.id = groupBodyId;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'cad-tool-group-toggle';
    toggle.setAttribute('aria-controls', groupBodyId);
    toggle.innerHTML = `<span>${title}</span><span class="cad-tool-group-meta"><small>${groupBody.children.length}</small><b aria-hidden="true">⌄</b></span>`;
    heading.replaceWith(toggle);

    const stored = safeStorageGet(`${CAD_INTERFACE_V2_STATE_PREFIX}${key}`);
    const defaultExpanded = index < 2;
    setDrawerGroupState(group, stored == null ? defaultExpanded : stored === '1', false);
    toggle.addEventListener('click', () => {
      setDrawerGroupState(group, toggle.getAttribute('aria-expanded') !== 'true');
    });
  });

  const input = searchWrap.querySelector('#cadToolSearchInput');
  const clear = searchWrap.querySelector('#cadToolSearchClear');
  const normalize = (text) => String(text || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const applySearch = () => {
    const query = normalize(input.value.trim());
    clear.hidden = !query;
    groups.forEach((group) => {
      const actions = [...group.querySelectorAll('.cad-mlight-action, .cad-round3-python')];
      let matches = 0;
      actions.forEach((action) => {
        const visible = !query || normalize(`${action.textContent} ${action.title || ''}`).includes(query);
        action.hidden = !visible;
        if (visible) matches += 1;
      });
      group.hidden = Boolean(query) && matches === 0;
      if (query && matches > 0) setDrawerGroupState(group, true, false);
      if (!query) {
        const stored = safeStorageGet(`${CAD_INTERFACE_V2_STATE_PREFIX}${group.dataset.groupKey}`);
        const index = groups.indexOf(group);
        setDrawerGroupState(group, stored == null ? index < 2 : stored === '1', false);
      }
    });
  };
  input.addEventListener('input', applySearch);
  clear.addEventListener('click', () => {
    input.value = '';
    applySearch();
    input.focus();
  });
}

function upgradePrecisionStatusbar(page) {
  const precision = page.querySelector('#cadPrecisionAssist');
  if (!precision || precision.dataset.interfaceV2 === '1') return false;
  precision.dataset.interfaceV2 = '1';

  const panel = precision.querySelector('#cadPrecisionPanel');
  const panelHead = panel?.querySelector('.cad-precision-panel-head');
  const measure = precision.querySelector('#cadPrecisionMeasure');
  const polarLine = precision.querySelector('#cadPrecisionPolarLine');

  if (panel && panelHead && (measure || polarLine)) {
    const quickSection = document.createElement('section');
    quickSection.className = 'cad-interface-precision-actions';
    quickSection.innerHTML = '<div class="cad-precision-section-title">AÇÕES RÁPIDAS</div><div class="cad-interface-precision-action-grid"></div>';
    const grid = quickSection.querySelector('.cad-interface-precision-action-grid');
    [measure, polarLine].filter(Boolean).forEach((button) => {
      button.classList.add('cad-interface-precision-panel-action');
      grid.appendChild(button);
    });
    panelHead.insertAdjacentElement('afterend', quickSection);
  }

  const coords = precision.querySelector('#cadPrecisionCoords');
  if (coords) coords.setAttribute('aria-label', 'Coordenadas do cursor');
  return true;
}

function upgradeStatusbar(page) {
  const statusbar = page.querySelector('.cad-mlight-statusbar');
  if (!statusbar || statusbar.dataset.interfaceV2 === '1') return;
  statusbar.dataset.interfaceV2 = '1';

  const form = statusbar.querySelector('#mlightCommandForm');
  if (form) {
    const label = document.createElement('span');
    label.className = 'cad-interface-command-label';
    label.textContent = '⌘';
    label.setAttribute('aria-hidden', 'true');
    form.prepend(label);
  }

  statusbar.querySelectorAll('.cad-mlight-status-actions [data-cad-command]').forEach((button) => {
    const command = button.dataset.cadCommand;
    const labels = { undo: ['↶', 'Desfazer'], redo: ['↷', 'Refazer'], layer: ['▱', 'Camadas'] };
    const cfg = labels[command];
    if (!cfg) return;
    button.title = cfg[1];
    button.setAttribute('aria-label', cfg[1]);
    button.innerHTML = `<span aria-hidden="true">${cfg[0]}</span><em>${cfg[1]}</em>`;
  });
}

function finalizeInterface(page) {
  if (!page || page.dataset.interfaceV2 === '1') return false;
  loadInterfaceV2Styles();
  upgradeAppbar(page);
  upgradeDrawer(page);
  upgradeStatusbar(page);
  upgradePrecisionStatusbar(page);
  page.dataset.interfaceV2 = '1';
  document.documentElement.dataset.cadInterface = 'v2';
  return true;
}

function bootInterfaceV2() {
  let attempts = 0;
  const tryBoot = () => {
    const page = document.getElementById('cadMlightPage');
    if (!page) {
      if (attempts++ < 60) return window.setTimeout(tryBoot, 100);
      return;
    }
    loadInterfaceV2Styles();
    upgradeAppbar(page);
    upgradeDrawer(page);
    upgradeStatusbar(page);
    if (upgradePrecisionStatusbar(page)) {
      page.dataset.interfaceV2 = '1';
      document.documentElement.dataset.cadInterface = 'v2';
      return;
    }
    if (attempts++ < 60) window.setTimeout(tryBoot, 100);
    else finalizeInterface(page);
  };
  tryBoot();
}

bootInterfaceV2();
window.addEventListener('cad:mlight-ready', bootInterfaceV2);
