(() => {
  'use strict';

  const root = document.querySelector('.almox-page');
  if (!root) return;

  root.querySelectorAll('[data-fill-remaining]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.fillRemaining;
      const input = document.getElementById(targetId);
      if (!input) return;
      const remaining = Number(button.dataset.remaining || input.max || 0);
      if (remaining > 0) {
        input.value = String(remaining);
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });

  root.querySelectorAll('input[data-receive-quantity]').forEach((input) => {
    const validate = () => {
      const value = Number(input.value || 0);
      const max = Number(input.max || 0);
      const invalid = value <= 0 || (max > 0 && value > max);
      input.setCustomValidity(invalid && input.value ? `Informe uma quantidade entre 0,01 e ${max}.` : '');
    };
    input.addEventListener('input', validate);
    validate();
  });

  root.querySelectorAll('form[data-confirm-message]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (form.dataset.confirmed === 'true') return;
      const message = form.dataset.confirmMessage;
      if (message && !window.confirm(message)) {
        event.preventDefault();
        return;
      }
      form.dataset.confirmed = 'true';
    });
  });

  root.querySelectorAll('form[data-lock-submit]').forEach((form) => {
    form.addEventListener('submit', () => {
      if (!form.checkValidity()) return;
      form.querySelectorAll('button[type="submit"]').forEach((button) => {
        button.disabled = true;
        const pendingText = button.dataset.pendingText;
        if (pendingText) button.textContent = pendingText;
      });
    });
  });

  const itemSelect = root.querySelector('[data-stock-item-select]');
  const stockHint = root.querySelector('[data-stock-hint]');
  const qtyInput = root.querySelector('[data-stock-quantity]');
  if (itemSelect && stockHint) {
    const refreshStockHint = () => {
      const option = itemSelect.options[itemSelect.selectedIndex];
      if (!option || !option.value) {
        stockHint.textContent = 'Selecione um item para consultar o saldo disponível.';
        if (qtyInput) qtyInput.removeAttribute('max');
        return;
      }
      const balance = Number(option.dataset.balance || 0);
      const unit = option.dataset.unit || 'UN';
      stockHint.textContent = `Saldo disponível: ${balance} ${unit}`;
      if (qtyInput && balance >= 0) qtyInput.max = String(balance);
    };
    itemSelect.addEventListener('change', refreshStockHint);
    refreshStockHint();
  }
})();
