(() => {
  const equipment = Array.from(document.querySelectorAll('[data-ri-equipment]'));
  const search = document.querySelector('[data-ri-search]');
  const selectAll = document.querySelector('[data-ri-select-all]');
  const count = document.querySelector('[data-ri-count]');
  const updateCount = () => {
    if (count) count.textContent = `${equipment.filter((row) => row.querySelector('input').checked).length} selecionados`;
    const visible = equipment.filter((row) => !row.hidden);
    const selected = visible.filter((row) => row.querySelector('input').checked).length;
    if (selectAll) {
      selectAll.checked = visible.length > 0 && selected === visible.length;
      selectAll.indeterminate = selected > 0 && selected < visible.length;
    }
  };
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLocaleLowerCase('pt-BR');
    equipment.forEach((row) => { row.hidden = !row.dataset.search.includes(q); });
    updateCount();
  });
  selectAll?.addEventListener('change', () => {
    equipment.filter((row) => !row.hidden).forEach((row) => { row.querySelector('input').checked = selectAll.checked; });
    updateCount();
  });
  equipment.forEach((row) => row.querySelector('input').addEventListener('change', updateCount));
  document.querySelectorAll('[data-ri-record]').forEach((record) => {
    const result = record.querySelector('[data-ri-result]');
    const update = () => record.querySelectorAll('[data-ri-kind]').forEach((field) => {
      const relevant = result.value === field.dataset.riKind || result.value === 'AMBAS';
      field.hidden = !relevant;
      field.querySelector('textarea').required = relevant;
    });
    result.addEventListener('change', update);
    update();
  });
  updateCount();
})();
