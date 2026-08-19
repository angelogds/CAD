(() => {
  const readJson = (id, fallback = {}) => {
    const node = document.getElementById(id); if (!node) return fallback;
    try { return JSON.parse(node.textContent || '{}'); } catch (_) { return fallback; }
  };
  const escapeHtml = (value) => String(value ?? '-').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const detailsByCell = readJson('inspecao-details-data', {});
  const modal = document.getElementById('dayModal');
  const modalTitle = document.getElementById('dayModalTitle');
  const modalList = document.getElementById('dayModalList');
  document.querySelectorAll('.status-badge-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!modal || !modalTitle || !modalList) return;
      const rows = detailsByCell[btn.dataset.key] || [];
      modalTitle.textContent = `Detalhes da inspeção — ${btn.dataset.eq} • item ${btn.dataset.item} • dia ${btn.dataset.day}`;
      modalList.innerHTML = rows.length ? rows.map((row) => `<li><strong>OS #${escapeHtml(row.id)}</strong> — ${escapeHtml(row.status)}<br>Não conformidade: ${escapeHtml(row.nao_conformidade || row.problema)}<br>Ação preventiva: ${escapeHtml(row.causa_diagnostico)}<br>Ação corretiva: ${escapeHtml(row.resumo_tecnico)}<br>Ocorrência: ${escapeHtml(row.data_inicio)} | Correção: ${escapeHtml(row.data_fim)}</li>`).join('') : '<li>Sem OS vinculada neste dia.</li>';
      modal.style.display = 'flex'; modal.setAttribute('aria-hidden','false');
    });
  });
  const closeModal = () => { if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden','true'); } };
  document.getElementById('closeDayModal')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const osCards = [...document.querySelectorAll('[data-os-card]')];
  const counter = document.getElementById('filter-count');
  const empty = document.getElementById('os-filter-empty');
  const matches = (card, filter) => {
    const status = card.dataset.status; const days = Number(card.dataset.days || 0);
    if (filter === 'todos') return true; if (filter === 'abertas') return status === 'ABERTA'; if (filter === 'em_andamento') return status === 'EM_ANDAMENTO'; if (filter === 'pausadas') return status === 'PAUSADA'; if (filter === 'aguardando_material') return status === 'AGUARDANDO_MATERIAL';
    if (filter === 'dias_7') return days > 7; if (filter === 'dias_15') return days > 15; if (filter === 'dias_30') return days > 30; if (filter === 'dias_45') return days > 45; return true;
  };
  filterButtons.forEach((button) => button.addEventListener('click', () => {
    const filter = button.dataset.filter; let visible = 0;
    filterButtons.forEach((item) => item.classList.toggle('active', item === button));
    osCards.forEach((card) => { const show = matches(card, filter); card.hidden = !show; if (show) visible += 1; });
    if (counter) counter.textContent = `${visible} ${visible === 1 ? 'OS exibida' : 'OS exibidas'}`;
    if (empty) empty.style.display = visible === 0 && osCards.length ? 'block' : 'none';
  }));
})();
