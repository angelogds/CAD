export function bindToolbar(onToolChange) {
  document.querySelectorAll('[data-tool]').forEach((btn) => btn.addEventListener('click', () => onToolChange(btn.dataset.tool)));
}
