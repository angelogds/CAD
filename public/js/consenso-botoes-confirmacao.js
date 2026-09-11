(() => {
  function ensureStyles() {
    if (document.querySelector('style[data-consenso-confirmacao-ui]')) return;
    const style = document.createElement('style');
    style.dataset.consensoConfirmacaoUi = '1';
    style.textContent = `
      .consensus-decision-buttons{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;margin-top:7px}
      .consensus-decision-buttons button:disabled{opacity:.55;cursor:not-allowed;filter:grayscale(.15)}
      .consensus-decision-hint{display:block;margin-top:5px;color:#806514;font-size:10px;font-weight:700;line-height:1.35}
      .sol-consensus-wait .consensus-decision-buttons{justify-content:flex-start}
      @media(max-width:620px){.consensus-decision-buttons{display:grid;grid-template-columns:1fr 1fr}.consensus-decision-buttons button{width:100%}}
    `;
    document.head.append(style);
  }

  function renameActiveButtons() {
    document.querySelectorAll('.purchase-change-actions form').forEach((form) => {
      const buttons = [...form.querySelectorAll('button[type="submit"]')];
      buttons.forEach((button) => {
        const target = String(button.formAction || button.getAttribute('formaction') || form.action || '');
        if (target.includes('/recusar')) button.textContent = 'Recusar alteração';
        else if (target.includes('/aprovar')) button.textContent = 'Confirmar alteração';
      });
    });

    document.querySelectorAll('.sol-consensus-form').forEach((form) => {
      const buttons = [...form.querySelectorAll('button[type="submit"]')];
      buttons.forEach((button) => {
        const target = String(button.formAction || button.getAttribute('formaction') || form.action || '');
        if (target.includes('/recusar')) button.textContent = 'Recusar alteração';
        else if (target.includes('/aprovar')) button.textContent = 'Confirmar alteração';
      });
    });
  }

  function addDisabledDecisionButtons(container, message) {
    if (!container || container.querySelector('.consensus-decision-buttons')) return;

    const actions = document.createElement('div');
    actions.className = 'consensus-decision-buttons';

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.disabled = true;
    reject.className = 'ui-btn ui-btn--danger-soft ui-btn--table';
    reject.textContent = 'Recusar alteração';
    reject.title = message;

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.disabled = true;
    approve.className = 'ui-btn ui-btn--table';
    approve.textContent = 'Confirmar alteração';
    approve.title = message;

    const hint = document.createElement('small');
    hint.className = 'consensus-decision-hint';
    hint.textContent = message;

    actions.append(reject, approve);
    container.append(actions, hint);
  }

  function enhancePurchasingWaitStates() {
    document.querySelectorAll('.purchase-change-actions').forEach((area) => {
      if (area.querySelector('form')) return;
      const wait = area.querySelector('.purchase-change-wait');
      if (!wait) return;
      const text = String(wait.textContent || '');
      const message = text.includes('outro usuário do setor de Compras')
        ? 'Você criou esta proposta. Para manter o consenso bilateral, outro usuário de Compras/Admin deve entrar e confirmar ou recusar.'
        : 'A decisão deve ser feita pela contraparte indicada no consenso. Quem criou a proposta não pode aprovar a própria alteração.';
      addDisabledDecisionButtons(area, message);
    });
  }

  function enhanceSolicitationWaitStates() {
    document.querySelectorAll('.sol-consensus-wait').forEach((wait) => {
      const message = 'Você criou esta proposta ou não é a contraparte responsável. O outro lado do consenso deve confirmar ou recusar.';
      addDisabledDecisionButtons(wait, message);
    });
  }

  function enhance() {
    ensureStyles();
    renameActiveButtons();
    enhancePurchasingWaitStates();
    enhanceSolicitationWaitStates();
  }

  function boot() {
    enhance();
    const observer = new MutationObserver(() => enhance());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
