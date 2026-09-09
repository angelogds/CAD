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

  let correctionDialog = null;
  function ensureCorrectionDialog() {
    if (correctionDialog) return correctionDialog;
    correctionDialog = document.createElement('dialog');
    correctionDialog.className = 'purchase-consensus-dialog';
    correctionDialog.id = 'edit-purchased-item-dialog';
    correctionDialog.innerHTML = `
      <form method="POST" id="edit-purchased-item-form">
        <div class="dialog-head">
          <div><span class="section-kicker">CORREÇÃO DE COMPRA</span><h2>Editar item comprado</h2></div>
          <button type="button" class="dialog-close" data-close-correction aria-label="Fechar">×</button>
        </div>
        <p>Corrija somente uma marcação feita por engano. O item <strong data-correction-item></strong> ainda não possui recebimento do Almoxarifado.</p>
        <div class="consensus-inline">
          <label class="check-label"><input type="checkbox" name="cotado" value="1" data-correction-quoted> <strong>Item cotado</strong></label>
          <small>Desmarque para voltar o item a PENDENTE e limpar fornecedor e valor da cotação.</small>
        </div>
        <div class="consensus-inline">
          <label class="check-label"><input type="checkbox" name="comprado" value="1" data-correction-purchased> <strong>Item comprado</strong></label>
          <small>Desmarque para desfazer a compra e liberar a seleção do item correto.</small>
        </div>
        <input type="hidden" name="fornecedor_id" data-correction-supplier>
        <input type="hidden" name="valor_unitario" data-correction-price>
        <div class="dialog-actions">
          <button type="button" class="ui-btn ui-btn--outline" data-close-correction>Cancelar</button>
          <button type="submit" class="ui-btn">Salvar correção</button>
        </div>
      </form>`;
    document.body.appendChild(correctionDialog);

    const quoted = correctionDialog.querySelector('[data-correction-quoted]');
    const purchased = correctionDialog.querySelector('[data-correction-purchased]');
    quoted?.addEventListener('change', () => {
      if (!quoted.checked && purchased) purchased.checked = false;
    });
    purchased?.addEventListener('change', () => {
      if (purchased.checked && quoted) quoted.checked = true;
    });
    correctionDialog.querySelectorAll('[data-close-correction]').forEach((button) => {
      button.addEventListener('click', () => correctionDialog.close());
    });
    return correctionDialog;
  }

  function receivedQuantity(row) {
    const text = row.querySelector('.purchase-receipt-readonly strong')?.textContent || '0';
    const match = text.match(/^\s*([\d.,]+)/);
    const number = Number(String(match?.[1] || '0').replace(',', '.'));
    return Number.isFinite(number) ? number : 0;
  }

  function editItem(row) {
    if (!row.classList.contains('state-comprado')) {
      row.querySelector('.unit-price')?.focus();
      return;
    }

    if (receivedQuantity(row) > 0) {
      alert('Este item já possui recebimento registrado pelo Almoxarifado e não pode ter a compra desfeita por aqui. Faça a correção pelo fluxo de recebimento.');
      return;
    }

    const itemId = row.querySelector('input[name="item_id"]')?.value;
    const solicitacaoId = location.pathname.match(/\/compras\/solicitacoes\/(\d+)/)?.[1];
    if (!itemId || !solicitacaoId) {
      alert('Não foi possível identificar o item para correção.');
      return;
    }

    const dialog = ensureCorrectionDialog();
    const correctionForm = dialog.querySelector('#edit-purchased-item-form');
    const itemName = row.querySelector('td[data-label="Item"] strong')?.textContent?.trim() || `#${itemId}`;
    const supplier = row.querySelector('.supplier')?.value || '';
    const price = row.querySelector('.unit-price')?.value || '0';
    const quoted = dialog.querySelector('[data-correction-quoted]');
    const purchased = dialog.querySelector('[data-correction-purchased]');

    correctionForm.action = `/compras/solicitacoes/${solicitacaoId}/itens/${itemId}/corrigir-compra`;
    dialog.querySelector('[data-correction-item]').textContent = itemName;
    dialog.querySelector('[data-correction-supplier]').value = supplier;
    dialog.querySelector('[data-correction-price]').value = price;
    if (quoted) quoted.checked = true;
    if (purchased) purchased.checked = true;

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else if (confirm('Desfazer a compra deste item e mantê-lo somente como cotado?')) {
      if (purchased) purchased.checked = false;
      correctionForm.submit();
    }
  }

  form.addEventListener('input', update);
  rows.forEach((row) => {
    row.querySelector('.buy-check')?.addEventListener('change', syncSelectAll);
    row.querySelector('.edit-item')?.addEventListener('click', () => editItem(row));
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
