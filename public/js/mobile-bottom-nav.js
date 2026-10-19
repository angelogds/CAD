// Reutiliza o mesmo drawer lateral já controlado pelo cabeçalho.
(() => {
  const more = document.getElementById('mobileNavMore');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const app = document.getElementById('appRoot');
  if (!more || !sidebarToggle || !app) return;
  const sync = () => {
    const isOpen = app.classList.contains('mobile-sidebar-open');
    more.setAttribute('aria-expanded', String(isOpen));
    more.setAttribute('aria-label', isOpen ? 'Fechar outros módulos' : 'Abrir outros módulos');
  };
  more.addEventListener('click', () => { sidebarToggle.click(); sync(); });
  new MutationObserver(sync).observe(app, { attributes:true, attributeFilter:['class'] });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !app.classList.contains('mobile-sidebar-open')) return;
    if (!window.matchMedia('(max-width:720px)').matches) return;
    sidebarToggle.click();
    more.focus();
  });
  sync();
})();
