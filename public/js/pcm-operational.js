(function () {
  document.querySelectorAll('[data-pcm-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      const message = form.getAttribute('data-pcm-confirm');
      if (message && !window.confirm(message)) event.preventDefault();
    });
  });
  document.querySelectorAll('[data-pcm-loading]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (event.defaultPrevented) return;
      const button = form.querySelector('button[type="submit"]');
      if (!button || button.disabled) return;
      button.disabled = true;
      button.dataset.originalLabel = button.textContent;
      button.textContent = 'Processando…';
    });
  });
})();
