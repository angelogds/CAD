(() => {
  const form = document.querySelector('.dashboard-filters');
  if (!form) return;
  const params = new URLSearchParams(location.search);
  for (const field of form.elements) {
    if (field.name && params.has(field.name)) field.value = params.get(field.name);
  }
  form.addEventListener('submit', () => {
    const button = form.querySelector('.refresh-button');
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
  });
})();
