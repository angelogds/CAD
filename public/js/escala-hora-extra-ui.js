(() => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  document.querySelectorAll('[data-os-picker]').forEach(root => {
    const select = root.querySelector('select[name="os_id"]');
    const ui = root.querySelector('[data-os-ui]');
    const toggle = root.querySelector('.escala-os-toggle');
    const panel = root.querySelector('[data-os-panel]');
    const search = root.querySelector('[data-os-search]');
    const list = root.querySelector('[data-os-list]');
    const empty = root.querySelector('[data-os-empty]');
    const selected = root.querySelector('[data-os-selected]');
    let visible = [], active = -1;
    const records = Array.from(select.options, (option, index) => {
      const title = option.value ? `OS #${option.value} · ${option.dataset.equipment || 'Equipamento'}` : 'Sem OS';
      const description = option.dataset.description || '';
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'escala-os-option'; button.tabIndex = -1;
      button.id = `horaExtraOsOption-${index}`; button.setAttribute('role', 'option');
      const name = document.createElement('strong'); name.textContent = title; button.append(name);
      if (description) { const text = document.createElement('small'); text.textContent = description; button.append(text); }
      list.append(button);
      const record = { option, title, button, text: normalize(`${title} ${description}`) };
      button.addEventListener('click', () => choose(record));
      return record;
    });
    function syncSelection() {
      const record = records.find(r => r.option.value === select.value) || records[0];
      selected.textContent = record.title;
      const help = root.closest('form').querySelector('#horaExtraDescricaoAjuda');
      if (help) help.hidden = Boolean(select.value);
      records.forEach(r => r.button.setAttribute('aria-selected', String(r === record)));
    }
    function highlight(index, scroll = false) {
      active = visible.length ? Math.max(0, Math.min(index, visible.length - 1)) : -1;
      records.forEach(r => r.button.classList.toggle('is-active', visible[active] === r));
      if (active >= 0) {
        search.setAttribute('aria-activedescendant', visible[active].button.id);
        if (scroll) visible[active].button.scrollIntoView({ block: 'nearest' });
      } else search.removeAttribute('aria-activedescendant');
    }
    function filter() {
      const query = normalize(search.value).trim();
      visible = records.filter(r => r.text.includes(query));
      records.forEach(r => { r.button.hidden = !visible.includes(r); });
      empty.hidden = visible.length > 0;
      highlight(Math.max(0, visible.findIndex(r => r.option.value === select.value)));
      list.scrollTop = 0;
    }
    function close(focus = false) {
      panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); search.setAttribute('aria-expanded', 'false');
      if (focus) toggle.focus();
    }
    function open() {
      panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); search.setAttribute('aria-expanded', 'true');
      search.value = ''; filter(); search.focus({ preventScroll: true });
    }
    function choose(record) {
      select.value = record.option.value; select.dispatchEvent(new Event('change', { bubbles: true })); close(true);
    }
    toggle.addEventListener('click', () => panel.hidden ? open() : close());
    toggle.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
    });
    search.addEventListener('input', filter);
    search.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); highlight(active + 1, true); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); highlight(active - 1, true); }
      else if (event.key === 'Enter') { event.preventDefault(); if (visible[active]) choose(visible[active]); }
      else if (event.key === 'Escape') { event.preventDefault(); close(true); }
      else if (event.key === 'Tab') close();
    });
    document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); });
    select.addEventListener('change', syncSelection);
    syncSelection();
    select.hidden = true; select.tabIndex = -1;
    root.querySelector('label').htmlFor = toggle.id;
    ui.hidden = false;
  });

  document.querySelectorAll('[data-photo-field]').forEach(root => {
    const input = root.querySelector('input[type="file"]');
    const ui = root.querySelector('[data-photo-ui]');
    const open = root.querySelector('[data-photo-open]');
    const clear = root.querySelector('[data-photo-clear]');
    const name = root.querySelector('[data-photo-name]');
    const update = () => {
      const file = input.files?.[0];
      name.textContent = file ? file.name : 'Nenhuma foto selecionada';
      name.title = file ? file.name : '';
      clear.hidden = !file;
      open.lastChild.textContent = file ? 'Trocar foto' : 'Adicionar foto';
    };
    open.addEventListener('click', () => input.click());
    clear.addEventListener('click', () => { input.value = ''; update(); open.focus(); });
    input.addEventListener('change', update);
    input.hidden = true; ui.hidden = false;
    update();
  });
})();
