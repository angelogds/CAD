document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open-external]');
  if (!trigger) return;
  const url = trigger.getAttribute('data-open-external');
  if (!url) return;
  window.open(url, '_blank', 'noopener');
});
