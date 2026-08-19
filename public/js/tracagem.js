(() => {
  const STORAGE_KEY = 'campo-do-gado-tracagem-favoritos';
  const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
  let storedFavorites = [];
  try { storedFavorites = safeJson(localStorage.getItem(STORAGE_KEY), []); } catch (_) { storedFavorites = []; }
  const favorites = new Set(storedFavorites);
  const persistFavorites = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites])); } catch (_) {} };
  const syncFavoriteUi = () => {
    document.querySelectorAll('[data-tr-favorite]').forEach((button) => {
      const key = button.dataset.trFavorite;
      const active = favorites.has(key);
      button.classList.toggle('is-favorite', active);
      button.textContent = active ? 'Favorito' : 'Favoritar';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const counter = document.querySelector('[data-tr-favorite-count]');
    if (counter) counter.textContent = String(favorites.size);
  };
  document.addEventListener('click', (event) => {
    const favoriteButton = event.target.closest('[data-tr-favorite]');
    if (favoriteButton) {
      const key = favoriteButton.dataset.trFavorite;
      favorites.has(key) ? favorites.delete(key) : favorites.add(key);
      persistFavorites(); syncFavoriteUi();
    }
  });
  syncFavoriteUi();

  document.querySelectorAll('[data-tr-submit]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = document.querySelector('.tracagem-calculator-form');
      if (!form) return;
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
    });
  });

  document.querySelectorAll('.tracagem-calculator-form').forEach((form) => {
    form.addEventListener('submit', () => {
      const button = form.querySelector('button[type="submit"]');
      if (!button || button.disabled) return;
      button.dataset.originalText = button.textContent;
      button.textContent = 'Calculando...';
      button.disabled = true;
    });
  });

  let modal = null;
  const ensureModal = () => {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'tracagem-image-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<button type="button" class="tracagem-image-close">Fechar</button><img alt="Vista técnica ampliada">';
    document.body.appendChild(modal);
    const close = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); };
    modal.querySelector('button').addEventListener('click', close);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    return modal;
  };
  document.querySelectorAll('.img-tecnica').forEach((image) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn btn-outline btn-sm tracagem-zoom-btn'; button.textContent = 'Ampliar';
    image.insertAdjacentElement('afterend', button);
    const open = () => { const m = ensureModal(); m.querySelector('img').src = image.src; m.querySelector('img').alt = image.alt || 'Vista técnica ampliada'; m.classList.add('open'); m.setAttribute('aria-hidden','false'); };
    button.addEventListener('click', open); image.addEventListener('click', open);
  });
})();
