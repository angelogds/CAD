(function () {
  function normalizeWhatsappInputValue(value) {
    const compact = String(value || '').replace(/[\s\-()+]/g, '').trim();
    if (!compact) return '';
    if (!/^\d+$/.test(compact)) {
      throw new Error('WhatsApp deve conter somente números. Espaços, traços, parênteses e + são removidos automaticamente.');
    }

    let phone = compact;
    if (!phone.startsWith('55') && /^\d{10,11}$/.test(phone)) phone = '55' + phone;
    if (!/^55\d{10,11}$/.test(phone)) {
      throw new Error('WhatsApp deve ter entre 12 e 13 dígitos no formato 55DDDNÚMERO.');
    }
    return phone;
  }

  function syncRoleContext(form) {
    const roleSelect = form.querySelector('select[name="role"]');
    const functionInput = form.querySelector('[data-role-function]');
    const sectorInput = form.querySelector('[data-role-sector]');
    const option = roleSelect?.selectedOptions?.[0];

    if (functionInput) functionInput.value = option?.dataset?.funcao || '';
    if (sectorInput) sectorInput.value = option?.dataset?.setor || '';
  }

  document.querySelectorAll('[data-user-form]').forEach(function (form) {
    const roleSelect = form.querySelector('select[name="role"]');
    roleSelect?.addEventListener('change', function () { syncRoleContext(form); });
    syncRoleContext(form);

    form.addEventListener('submit', function (event) {
      const input = form.querySelector('[data-whatsapp-input]');
      if (!input || !String(input.value || '').trim()) return;

      try {
        const normalized = normalizeWhatsappInputValue(input.value);
        if (normalized.length === 12 && !window.confirm('Este WhatsApp parece estar sem o 9º dígito após o DDD. Deseja salvar mesmo assim?')) {
          event.preventDefault();
          input.focus();
          return;
        }
        input.value = normalized;
      } catch (err) {
        event.preventDefault();
        window.alert(err.message || 'WhatsApp inválido.');
        input.focus();
      }
    });
  });
})();
