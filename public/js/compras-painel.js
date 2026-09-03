(() => {
  const form = document.querySelector('#quote-form');
  if (!form) return;

  const rows = [...document.querySelectorAll('.quote-row')];
  const selectAll = document.querySelector('#select-all-items');
  const parse = (value) => {
    const normalized = String(value || '').trim().replace(/\./g, '').replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : 0;
  };
  const parseDisplay = (value) => {
    let raw = String(value || '').replace(/R\$/gi, '').replace(/\s/g, '');
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (raw.includes(',')) raw = raw.replace(',', '.');
    const number = Number(raw);
    return Number.isFinite(number) ? Math.round(number * 100) : 0;
  };
  const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Linhas aguardando consenso de exclusão ficam bloqueadas e não possuem
  // inputs editáveis. O subtotal delas continua fazendo parte da solicitação
  // até o solicitante aprovar a exclusão.
  const initialSubtotal = parseDisplay(document.querySelector('[data-subtotal]')?.textContent || '0');
  const editableInitialSubtotal = rows.reduce((sum, row) => sum + parseDisplay(row.querySelector('.item-subtotal')?.textContent || '0'), 0);
  const lockedSubtotal = Math.max(0, initialSubtotal - editableInitialSubtotal);

  function syncSelectAll() {
    if (!selectAll) return;
    const available = rows.map((row) => row.querySelector('.buy-check')).filter((check) => check && !check.disabled);
    selectAll.checked = available.length > 0 && available.every((check) => check.checked);
    selectAll.indeterminate = available.some((check) => check.checked) && !selectAll.checked;
  }

  function update() {
    let subtotal = lockedSubtotal;
    rows.forEach((row) => {
      const quotedCheck = row.querySelector('.quoted-check');
      const buy = row.querySelector('.buy-check');
      const price = row.querySelector('.unit-price');
      const subtotalNode = row.querySelector('.item-subtotal');
      if (!quotedCheck || !buy || !price || !subtotalNode) return;
      const quoted = quotedCheck.checked;
      const value = Math.round(Number(row.dataset.quantity || 0) * parse(price.value));
      subtotal += value;
      subtotalNode.textContent = brl(value);
      row.classList.toggle('state-cotado', quoted && !row.classList.contains('state-comprado'));
      row.classList.toggle('state-pendente', !quoted);
      buy.disabled = !quoted || row.classList.contains('state-comprado');
      if (buy.disabled) buy.checked = false;
      const badge = row.querySelector('.status-badge');
      if (badge && !row.classList.contains('state-comprado')) badge.textContent = quoted ? 'COTADO' : 'PENDENTE';
    });
    const freight = parse(form.frete?.value);
    const discount = parse(form.desconto?.value);
    const subtotalNode = document.querySelector('[data-subtotal]');
    if (subtotalNode) subtotalNode.textContent = brl(subtotal);
    document.querySelectorAll('[data-total-geral]').forEach((element) => { element.textContent = brl(Math.max(0, subtotal + freight - discount)); });
    syncSelectAll();
  }

  form.addEventListener('input', update);
  rows.forEach((row) => {
    row.querySelector('.buy-check')?.addEventListener('change', syncSelectAll);
    row.querySelector('.edit-item')?.addEventListener('click', () => row.querySelector('.unit-price')?.focus());
  });
  selectAll?.addEventListener('change', () => {
    rows.forEach((row) => {
      const check = row.querySelector('.buy-check');
      if (check && !check.disabled) check.checked = selectAll.checked;
    });
    syncSelectAll();
  });
  document.querySelector('#apply-supplier')?.addEventListener('click', () => {
    const value = document.querySelector('#main-supplier')?.value;
    if (!value) return;
    document.querySelectorAll('.supplier').forEach((supplier) => { if (!supplier.value) supplier.value = value; });
  });
  form.addEventListener('submit', (event) => {
    const action = event.submitter?.value || 'salvar';
    for (const row of rows) {
      const quoted = row.querySelector('.quoted-check');
      const supplier = row.querySelector('.supplier');
      const price = row.querySelector('.unit-price');
      if (quoted?.checked && (!supplier?.value || price?.value === '')) {
        event.preventDefault();
        alert('Itens cotados exigem fornecedor e valor unitário.');
        return;
      }
    }
    const subtotal = lockedSubtotal + rows.reduce((sum, row) => sum + Math.round(Number(row.dataset.quantity || 0) * parse(row.querySelector('.unit-price')?.value)), 0);
    if (parse(form.desconto?.value) > subtotal + parse(form.frete?.value)) {
      event.preventDefault();
      alert('O desconto não pode tornar o total negativo.');
      return;
    }
    if (action === 'comprar' && !rows.some((row) => row.querySelector('.buy-check')?.checked)) {
      event.preventDefault();
      alert('Selecione ao menos um item cotado para marcar como comprado.');
    }
  });
  update();
})();

// Seletor pesquisável e retorno seguro do cadastro rápido. O rascunho fica apenas nesta aba.
(() => {
  const form=document.querySelector('#quote-form'); if(!form)return;
  const key=`cotacao-rascunho-${location.pathname}`;
  document.querySelectorAll('.supplier-search').forEach(input=>input.addEventListener('input',()=>{const select=input.nextElementSibling;const q=input.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();[...select.options].forEach((o,i)=>{o.hidden=i>0&&!o.dataset.search?.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)});if(q){const first=[...select.options].find(o=>!o.hidden&&o.value);if(first)select.value=first.value;}}));
  document.querySelectorAll('.new-supplier').forEach(link=>link.addEventListener('click',()=>{const data={};new FormData(form).forEach((v,k)=>(data[k]??=[]).push(v));sessionStorage.setItem(key,JSON.stringify(data));}));
  const draft=sessionStorage.getItem(key);if(draft&&new URLSearchParams(location.search).has('fornecedor_selecionado')){try{const data=JSON.parse(draft);Object.entries(data).forEach(([name,vals])=>{const fields=[...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];fields.forEach((field,i)=>{if(field.type==='checkbox')field.checked=vals.includes(field.value);else if(!field.classList.contains('supplier')||!field.value)field.value=vals[i]??vals[0]??'';});});sessionStorage.removeItem(key);form.dispatchEvent(new Event('input',{bubbles:true}));}catch{sessionStorage.removeItem(key);}}
})();
