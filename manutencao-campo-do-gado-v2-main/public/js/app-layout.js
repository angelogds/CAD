// public/js/app-layout.js
(() => {
  const app = document.getElementById('appRoot');
  const btn = document.getElementById('sidebarToggle');
  if (!app || !btn) return;

  const isMobile = () => window.matchMedia('(max-width: 980px)').matches;

  btn.addEventListener('click', () => {
    if (isMobile()) {
      app.classList.toggle('mobile-sidebar-open');
      return;
    }

    app.classList.toggle('sidebar-collapsed');
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) {
      app.classList.remove('mobile-sidebar-open');
    }
  });
})();
