(() => {
  document.querySelectorAll('[data-auto-submit]').forEach(select => select.addEventListener('change', () => select.form.submit()));
  document.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  const form = document.getElementById('bulkWhatsappForm');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const option = document.getElementById('colaboradorWhatsAppSelect')?.selectedOptions[0];
    const phone = String(option?.dataset.telefone || '').replace(/\D/g, '');
    if (!phone) return window.alert('O colaborador não possui WhatsApp cadastrado.');
    const orders = [...document.querySelectorAll('.priority-group tbody tr')].map(row => row.innerText.replace(/\s+/g, ' ').trim()).slice(0, 20);
    if (!orders.length) return window.alert('Não há OS visíveis para enviar.');
    const message = `Olá, ${option.dataset.nome}.\n\nOrdens de serviço para acompanhamento:\n\n${orders.join('\n')}\n\nManutenção Industrial Campo do Gado`;
    window.location.assign(`https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}?text=${encodeURIComponent(message)}`);
  });
})();
