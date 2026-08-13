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
  const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function syncSelectAll() {
    if (!selectAll) return;
    const available = rows.map((row) => row.querySelector('.buy-check')).filter((check) => !check.disabled);
    selectAll.checked = available.length > 0 && available.every((check) => check.checked);
    selectAll.indeterminate = available.some((check) => check.checked) && !selectAll.checked;
  }

  function update() {
    let subtotal = 0;
    rows.forEach((row) => {
      const quoted = row.querySelector('.quoted-check').checked;
      const buy = row.querySelector('.buy-check');
      const value = Math.round(Number(row.dataset.quantity || 0) * parse(row.querySelector('.unit-price').value));
      subtotal += value;
      row.querySelector('.item-subtotal').textContent = brl(value);
      row.classList.toggle('state-cotado', quoted && !row.classList.contains('state-comprado'));
      row.classList.toggle('state-pendente', !quoted);
      buy.disabled = !quoted || row.classList.contains('state-comprado');
      if (buy.disabled) buy.checked = false;
      if (!row.classList.contains('state-comprado')) row.querySelector('.status-badge').textContent = quoted ? 'COTADO' : 'PENDENTE';
    });
    const freight = parse(form.frete.value);
    const discount = parse(form.desconto.value);
    document.querySelector('[data-subtotal]').textContent = brl(subtotal);
    document.querySelectorAll('[data-total-geral]').forEach((element) => { element.textContent = brl(Math.max(0, subtotal + freight - discount)); });
    syncSelectAll();
  }

  form.addEventListener('input', update);
  rows.forEach((row) => {
    row.querySelector('.buy-check').addEventListener('change', syncSelectAll);
    row.querySelector('.edit-item').addEventListener('click', () => row.querySelector('.unit-price').focus());
  });
  selectAll?.addEventListener('change', () => {
    rows.forEach((row) => {
      const check = row.querySelector('.buy-check');
      if (!check.disabled) check.checked = selectAll.checked;
    });
    syncSelectAll();
  });
  document.querySelector('#apply-supplier')?.addEventListener('click', () => {
    const value = document.querySelector('#main-supplier').value;
    if (!value) return;
    document.querySelectorAll('.supplier').forEach((supplier) => { if (!supplier.value) supplier.value = value; });
  });
  form.addEventListener('submit', (event) => {
    const action = event.submitter?.value || 'salvar';
    for (const row of rows) {
      if (row.querySelector('.quoted-check').checked && (!row.querySelector('.supplier').value || row.querySelector('.unit-price').value === '')) {
        event.preventDefault();
        alert('Itens cotados exigem fornecedor e valor unitário.');
        return;
      }
    }
    const subtotal = rows.reduce((sum, row) => sum + Math.round(Number(row.dataset.quantity) * parse(row.querySelector('.unit-price').value)), 0);
    if (parse(form.desconto.value) > subtotal + parse(form.frete.value)) {
      event.preventDefault();
      alert('O desconto não pode tornar o total negativo.');
      return;
    }
    if (action === 'comprar' && !rows.some((row) => row.querySelector('.buy-check').checked)) {
      event.preventDefault();
      alert('Selecione ao menos um item cotado para marcar como comprado.');
    }
  });
  update();
})();
