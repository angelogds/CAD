(() => {
  const dialog = document.querySelector('#delete-item-dialog');
  const dialogForm = document.querySelector('#delete-item-form');
  const itemName = dialog?.querySelector('[data-delete-item-name]');

  document.querySelectorAll('.js-request-item-delete').forEach((button) => {
    button.addEventListener('click', () => {
      if (!dialog || !dialogForm || button.disabled) return;
      dialogForm.action = button.dataset.action || '';
      if (itemName) itemName.textContent = button.dataset.item || 'selecionado';
      const reason = dialogForm.querySelector('[name="motivo"]');
      if (reason) reason.value = '';
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', 'open');
      setTimeout(() => reason?.focus(), 40);
    });
  });

  dialog?.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    });
  });

  dialog?.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) dialog.close?.();
  });

  // O botão fica visualmente dentro da tabela de cotação, mas o cancelamento do
  // pedido de exclusão não deve submeter o rascunho inteiro da compra.
  document.querySelectorAll('button[formaction$="/exclusao/cancelar"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      const action = button.getAttribute('formaction');
      if (!action) return;
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = action;
      form.hidden = true;
      document.body.appendChild(form);
      form.submit();
    });
  });

  const mode = document.querySelector('#extra-item-mode');
  const extraForm = mode?.closest('form');
  if (mode && extraForm) {
    const supplier = extraForm.querySelector('[name="fornecedor_id"]');
    const price = extraForm.querySelector('[name="valor_unitario"]');
    const sync = () => {
      const purchased = mode.value === 'COMPRADO';
      if (supplier) supplier.required = purchased;
      if (price) price.required = purchased;
    };
    mode.addEventListener('change', sync);
    sync();
  }
})();
