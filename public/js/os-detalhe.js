(function () {
  'use strict';

  const tabs = Array.from(document.querySelectorAll('[role="tab"][data-tab]'));
  const panels = Array.from(document.querySelectorAll('.os-tab-panel[role="tabpanel"]'));

  function selectTab(name, options) {
    const selected = tabs.find((tab) => tab.dataset.tab === name) || tabs[0];
    if (!selected) return;
    tabs.forEach((tab) => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.id !== selected.getAttribute('aria-controls'); });
    if (!options || options.updateHash !== false) history.replaceState(null, '', '#' + selected.dataset.tab);
    try { localStorage.setItem('os-detail-last-tab', selected.dataset.tab); } catch (_) {}
    if (options && options.focus) selected.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      selectTab(tabs[next].dataset.tab, { focus: true });
    });
  });

  const knownTabs = tabs.map((tab) => tab.dataset.tab);
  const initialHash = location.hash.slice(1);
  let remembered = '';
  try { remembered = localStorage.getItem('os-detail-last-tab') || ''; } catch (_) {}
  const defaultTab = document.querySelector('.os-workspace')?.dataset.defaultTab || 'justificativa';
  selectTab(knownTabs.includes(initialHash) ? initialHash : (knownTabs.includes(remembered) ? remembered : defaultTab), { updateHash: false });
  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1);
    if (knownTabs.includes(hash)) selectTab(hash, { updateHash: false });
  });

  function moveModule(id, slot, tab) {
    const module = document.getElementById(id);
    const destination = document.querySelector('[data-module-slot="' + slot + '"]');
    if (!module || !destination) return;
    module.classList.add('active');
    destination.appendChild(module);
    module.querySelectorAll('[data-os-module]').forEach((button) => {
      button.addEventListener('click', () => selectTab(tab));
    });
  }
  moveModule('justificativa-andamento', 'justificativa-andamento', 'justificativa');
  moveModule('redistribuicao-equipe', 'redistribuicao-equipe', 'redistribuicao');


  document.querySelectorAll('[data-os-module]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.osModule;
      const tab = id === 'redistribuicao-equipe' || id === 'equipe-os' ? 'redistribuicao' : 'justificativa';
      if (id !== 'whatsapp-os') selectTab(tab);
      if (id === 'whatsapp-os') document.getElementById(id)?.classList.toggle('active');
      document.getElementById(id === 'equipe-os' ? 'equipe-os' : id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('[data-confirm-team]').forEach((button) => button.addEventListener('click', (event) => {
    if (!window.confirm('Confirmar redistribuição automática? A equipe atual será comparada à escala e aos conflitos de outras OS.')) event.preventDefault();
  }));
  document.querySelectorAll('input[name="motivo_codigo"]').forEach((radio) => radio.addEventListener('change', () => {
    const note = document.querySelector('textarea[name="observacao_mecanico"]');
    if (note) note.required = radio.checked && radio.value === 'OUTRO';
  }));

  const menuWrap = document.getElementById('os-menu-wrap');
  const menuButton = document.getElementById('os-menu-btn');
  if (menuWrap && menuButton) {
    menuButton.addEventListener('click', () => {
      const open = menuWrap.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!menuWrap.contains(event.target)) { menuWrap.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); }
    });
  }

  const more = document.querySelector('.os-description-more');
  if (more) more.addEventListener('click', () => {
    const expanded = more.getAttribute('aria-expanded') === 'true';
    more.setAttribute('aria-expanded', String(!expanded));
    document.getElementById('os-description')?.classList.toggle('expanded', !expanded);
    more.textContent = expanded ? 'Ver mais' : 'Ver menos';
  });

  const elapsed = document.getElementById('os-elapsed');
  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  function updateElapsed() {
    if (!elapsed) return;
    const start = parseDate(elapsed.dataset.start);
    const end = parseDate(elapsed.dataset.end) || new Date();
    if (!start || end < start) { elapsed.textContent = 'Data de abertura não informada'; return; }
    const minutes = Math.floor((end - start) / 60000);
    elapsed.textContent = Math.floor(minutes / 1440) + 'd ' + String(Math.floor((minutes % 1440) / 60)).padStart(2, '0') + 'h ' + String(minutes % 60).padStart(2, '0') + 'm';
  }
  updateElapsed();
  if (elapsed && !elapsed.dataset.end) window.setInterval(updateElapsed, 30000);

  const input = document.getElementById('fechamento_fotos');
  const preview = document.getElementById('preview-fechamento');
  const message = document.getElementById('upload-message');
  const submit = document.getElementById('btn-concluir-os');
  const form = document.getElementById('form-concluir');
  if (!input || !preview || !submit || !form) return;

  let objectUrls = [];
  let validFilesCount = 0;
  const canRewriteFileList = typeof DataTransfer === 'function';
  const videoDuration = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number(video.duration)); };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Vídeo inválido')); };
    video.src = url;
  });
  async function validateFiles() {
    const selectedFiles = Array.from(input.files || []);
    const acceptedFiles = [];
    const errors = [];
    submit.disabled = true;
    message.textContent = selectedFiles.length ? 'Validando mídia de fechamento...' : 'Adicione uma foto ou vídeo de fechamento para concluir';

    for (const file of selectedFiles) {
      const fileName = String(file.name || 'arquivo');
      const mime = String(file.type || '').toLowerCase();
      const image = mime.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(fileName);
      const video = mime.startsWith('video/') || /\.(mp4|mov|webm|ogg|m4v|avi)$/i.test(fileName);
      if (!image && !video) { errors.push(fileName + ': use uma foto ou vídeo válido.'); continue; }
      if (video) {
        try { if ((await videoDuration(file)) > 60) { errors.push(fileName + ': o vídeo excede 1 minuto.'); continue; } }
        catch (_) { errors.push(fileName + ': não foi possível validar o vídeo.'); continue; }
      }
      acceptedFiles.push(file);
    }

    if (canRewriteFileList) {
      const transfer = new DataTransfer();
      acceptedFiles.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
    }

    objectUrls.forEach(URL.revokeObjectURL); objectUrls = [];
    preview.replaceChildren();
    acceptedFiles.forEach((file, index) => {
      const card = document.createElement('div'); card.className = 'os-file-preview';
      const url = URL.createObjectURL(file); objectUrls.push(url);
      const media = (String(file.type || '').startsWith('video/') || /\.(mp4|mov|webm|ogg|m4v|avi)$/i.test(file.name || '')) ? document.createElement('video') : document.createElement('img');
      media.src = url; if (media.tagName === 'VIDEO') media.muted = true;
      const info = document.createElement('span'); info.textContent = file.name + (file.type ? ' — ' + file.type : '');
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = canRewriteFileList ? 'Remover' : 'Limpar seleção';
      remove.addEventListener('click', () => {
        if (!canRewriteFileList) { input.value = ''; validateFiles(); return; }
        const dt = new DataTransfer();
        Array.from(input.files).forEach((item, i) => { if (i !== index) dt.items.add(item); });
        input.files = dt.files;
        validateFiles();
      });
      card.append(media, info, remove); preview.appendChild(card);
    });

    validFilesCount = acceptedFiles.length;
    const hasUnremovableInvalidFiles = !canRewriteFileList && errors.length > 0;
    submit.disabled = validFilesCount === 0 || hasUnremovableInvalidFiles;
    message.textContent = errors.join(' ') || (validFilesCount ? validFilesCount + ' arquivo(s) válido(s) selecionado(s).' : 'Adicione uma foto ou vídeo de fechamento para concluir');
    message.classList.toggle('error', errors.length > 0);
  }
  input.addEventListener('change', validateFiles);
  form.addEventListener('submit', (event) => {
    if (!validFilesCount || !input.files.length) { event.preventDefault(); message.textContent = 'Adicione uma foto ou vídeo de fechamento para concluir'; return; }
    if (form.dataset.submitting === 'true') { event.preventDefault(); return; }
    form.dataset.submitting = 'true'; submit.disabled = true; submit.textContent = 'Concluindo...';
  });
})();
