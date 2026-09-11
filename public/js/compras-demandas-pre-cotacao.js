(() => {
  async function loadDemandPrequotes() {
    const dashboard = document.querySelector('.purchase-dashboard');
    if (!dashboard || document.querySelector('.demand-prequote-panel')) return;

    let rows = [];
    try {
      const response = await fetch('/compras/demandas/pre-cotacoes.json', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      rows = Array.isArray(payload?.rows) ? payload.rows : [];
    } catch (_error) {
      return;
    }

    const section = document.createElement('section');
    section.className = 'dashboard-card demand-prequote-panel';
    section.setAttribute('aria-labelledby', 'demand-prequote-title');

    const head = document.createElement('div');
    head.className = 'demand-prequote-head';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'demand-prequote-kicker';
    kicker.textContent = 'PLANEJAMENTO ANTECIPADO';
    const title = document.createElement('h2');
    title.id = 'demand-prequote-title';
    title.textContent = 'Pré-cotações de Demandas';
    const description = document.createElement('p');
    description.textContent = 'Materiais de serviços ainda não convertidos em OS. Compras pode levantar preços e fornecedores, mas a compra fica bloqueada até a demanda virar Ordem de Serviço.';
    copy.append(kicker, title, description);

    const count = document.createElement('div');
    count.className = 'demand-prequote-count';
    const countValue = document.createElement('strong');
    countValue.textContent = String(rows.length);
    const countLabel = document.createElement('span');
    countLabel.textContent = rows.length === 1 ? 'pré-cotação' : 'pré-cotações';
    count.append(countValue, countLabel);
    head.append(copy, count);
    section.append(head);

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'demand-prequote-empty';
      empty.textContent = 'Nenhuma demanda com materiais aguardando pré-cotação no momento.';
      section.append(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'demand-prequote-list';
      rows.forEach((row) => {
        const total = Number(row.itens_count || 0);
        const quoted = Number(row.itens_cotados || 0);
        const pct = total ? Math.round((quoted / total) * 100) : 0;

        const article = document.createElement('article');
        article.className = 'demand-prequote-row';

        const main = document.createElement('div');
        main.className = 'demand-prequote-main';
        const requestLink = document.createElement('a');
        requestLink.href = `/compras/solicitacoes/${row.id}`;
        requestLink.textContent = `${row.numero || '#' + row.id} — ${row.titulo || 'Materiais da demanda'}`;
        const demandLink = document.createElement('a');
        demandLink.href = `/demandas/${row.demanda_id}`;
        demandLink.className = 'demand-prequote-demand-link';
        demandLink.textContent = `Demanda #${row.demanda_id} — ${row.demanda_titulo || 'Abrir demanda'}`;
        const meta = document.createElement('small');
        const details = [row.equipamento_nome || '', row.nr_referencia ? `NR: ${row.nr_referencia}` : '', row.aprovacao_status ? `Aprovação: ${row.aprovacao_status}` : ''].filter(Boolean);
        meta.textContent = details.join(' • ') || 'Demanda em planejamento';
        main.append(requestLink, demandLink, meta);

        const progress = document.createElement('div');
        progress.className = 'demand-prequote-progress';
        const progressText = document.createElement('span');
        progressText.textContent = `${quoted} de ${total} item(ns) cotado(s) — ${pct}%`;
        const bar = document.createElement('i');
        const fill = document.createElement('b');
        fill.style.width = `${pct}%`;
        bar.append(fill);
        progress.append(progressText, bar);

        const gate = document.createElement('div');
        gate.className = 'demand-prequote-gate';
        const gateStatus = document.createElement('strong');
        gateStatus.textContent = 'Cotação liberada';
        const gatePurchase = document.createElement('small');
        gatePurchase.textContent = 'Compra aguardando OS';
        const action = document.createElement('a');
        action.href = `/compras/solicitacoes/${row.id}`;
        action.className = 'ui-btn ui-btn--table';
        action.textContent = 'Abrir pré-cotação';
        gate.append(gateStatus, gatePurchase, action);

        article.append(main, progress, gate);
        list.append(article);
      });
      section.append(list);
    }

    const attention = dashboard.querySelector('.attention-card');
    if (attention) dashboard.insertBefore(section, attention);
    else dashboard.append(section);
  }

  function ensureConsensusStyles() {
    if (document.querySelector('link[data-compras-consenso-bilateral]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/compras-consenso-bilateral.css?v=20260911-1';
    link.dataset.comprasConsensoBilateral = '1';
    document.head.append(link);
  }

  function getPurchaseRequestId() {
    const match = window.location.pathname.match(/^\/compras\/solicitacoes\/(\d+)\/?$/);
    return match ? Number(match[1]) : null;
  }

  function formatQty(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return String(value || 0);
    return numeric.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  }

  function makeInfo(label, value, css = '') {
    const node = document.createElement('div');
    node.className = `purchase-change-info ${css}`.trim();
    const small = document.createElement('small');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    node.append(small, strong);
    return node;
  }

  function createDecisionCard(requestId, pending) {
    const article = document.createElement('article');
    article.className = 'purchase-change-row';

    const item = document.createElement('div');
    item.className = 'purchase-change-item';
    const name = document.createElement('strong');
    name.textContent = pending.item_nome || 'Item';
    const author = document.createElement('small');
    author.textContent = `Proposto por ${pending.solicitada_por_nome || 'usuário'} · ${pending.origem === 'SOLICITANTE' ? 'Solicitante' : 'Compras'}`;
    item.append(name, author);

    const currentQty = `${formatQty(pending.snapshot?.qtd_solicitada)} ${pending.snapshot?.unidade || ''}`.trim();
    const proposedQty = `${formatQty(pending.proposta?.qtd_solicitada)} ${pending.proposta?.unidade || pending.snapshot?.unidade || ''}`.trim();
    const current = makeInfo('Atual', currentQty);
    const proposed = makeInfo('Proposto', proposedQty, 'is-proposed');
    const reason = makeInfo('Motivo', pending.motivo || 'Não informado', 'is-reason');

    article.append(item, current, proposed, reason);

    const actionArea = document.createElement('div');
    actionArea.className = 'purchase-change-actions';
    if (pending.pode_responder) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `/compras/solicitacoes/${requestId}/itens/${pending.solicitacao_item_id}/alteracao/aprovar`;
      const observation = document.createElement('input');
      observation.className = 'input';
      observation.name = 'observacao';
      observation.maxLength = 1200;
      observation.placeholder = 'Observação da decisão (opcional)';

      const buttons = document.createElement('div');
      buttons.className = 'purchase-change-buttons';
      const reject = document.createElement('button');
      reject.type = 'submit';
      reject.className = 'ui-btn ui-btn--danger-soft ui-btn--table';
      reject.formAction = `/compras/solicitacoes/${requestId}/itens/${pending.solicitacao_item_id}/alteracao/recusar`;
      reject.textContent = 'Recusar';
      const approve = document.createElement('button');
      approve.type = 'submit';
      approve.className = 'ui-btn ui-btn--table';
      approve.textContent = 'Aprovar alteração';
      approve.addEventListener('click', (event) => {
        if (!window.confirm(`Confirmar a alteração de ${currentQty} para ${proposedQty}?`)) event.preventDefault();
      });
      buttons.append(reject, approve);
      form.append(observation, buttons);
      actionArea.append(form);
    } else {
      const wait = document.createElement('div');
      wait.className = 'purchase-change-wait';
      wait.textContent = pending.destino === 'SOLICITANTE'
        ? 'Aguardando confirmação do solicitante original.'
        : 'Aguardando outro usuário do setor de Compras. Quem propôs não pode aprovar a própria alteração.';
      actionArea.append(wait);
    }
    article.append(actionArea);
    return article;
  }

  function renderPendingConsensus(requestId, pendingRows) {
    const existing = document.querySelector('#consenso-itens');
    if (existing) existing.remove();
    if (!pendingRows.length) return;

    const section = document.createElement('section');
    section.className = 'card purchase-item-change-consensus';
    section.id = 'consenso-itens';

    const head = document.createElement('div');
    head.className = 'purchase-change-head';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'purchase-consensus-kicker';
    kicker.textContent = 'CONSENSO DE MATERIAIS';
    const title = document.createElement('h2');
    title.textContent = 'Alterações aguardando confirmação';
    const description = document.createElement('p');
    description.textContent = 'Solicitante e Compras precisam concordar antes da quantidade ser alterada. A compra do item fica bloqueada enquanto houver decisão pendente.';
    copy.append(kicker, title, description);
    const badge = document.createElement('strong');
    badge.className = 'purchase-change-count';
    badge.textContent = `${pendingRows.length} pendente${pendingRows.length === 1 ? '' : 's'}`;
    head.append(copy, badge);
    section.append(head);

    const list = document.createElement('div');
    list.className = 'purchase-change-list';
    pendingRows.forEach((pending) => list.append(createDecisionCard(requestId, pending)));
    section.append(list);

    const pageHead = document.querySelector('.quote-page-head');
    const linkedOs = document.querySelector('.linked-os');
    const anchor = linkedOs || pageHead;
    if (anchor) anchor.insertAdjacentElement('afterend', section);
  }

  function createQuantityDialog(requestId) {
    let dialog = document.querySelector('#purchase-quantity-consensus-dialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'purchase-quantity-consensus-dialog';
    dialog.className = 'purchase-consensus-dialog purchase-quantity-dialog';

    const form = document.createElement('form');
    form.method = 'POST';
    const head = document.createElement('div');
    head.className = 'dialog-head';
    const headingCopy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'section-kicker';
    kicker.textContent = 'CONSENSO COM O SOLICITANTE';
    const title = document.createElement('h2');
    title.textContent = 'Propor ajuste de quantidade';
    headingCopy.append(kicker, title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dialog-close';
    close.setAttribute('aria-label', 'Fechar');
    close.textContent = '×';
    close.addEventListener('click', () => dialog.close());
    head.append(headingCopy, close);

    const itemText = document.createElement('p');
    itemText.className = 'purchase-quantity-item';

    const quantities = document.createElement('div');
    quantities.className = 'purchase-quantity-grid';
    const currentWrap = document.createElement('label');
    const currentLabel = document.createElement('span');
    currentLabel.className = 'label';
    currentLabel.textContent = 'Quantidade atual';
    const current = document.createElement('input');
    current.className = 'input';
    current.readOnly = true;
    currentWrap.append(currentLabel, current);
    const proposedWrap = document.createElement('label');
    const proposedLabel = document.createElement('span');
    proposedLabel.className = 'label';
    proposedLabel.textContent = 'Nova quantidade proposta';
    const proposed = document.createElement('input');
    proposed.className = 'input';
    proposed.name = 'qtd_solicitada';
    proposed.inputMode = 'decimal';
    proposed.required = true;
    proposedWrap.append(proposedLabel, proposed);
    quantities.append(currentWrap, proposedWrap);

    const reasonWrap = document.createElement('label');
    const reasonLabel = document.createElement('span');
    reasonLabel.className = 'label';
    reasonLabel.textContent = 'Motivo da alteração';
    const reason = document.createElement('textarea');
    reason.className = 'input';
    reason.name = 'motivo';
    reason.required = true;
    reason.minLength = 5;
    reason.maxLength = 1200;
    reason.placeholder = 'Explique por que a quantidade precisa ser alterada. O solicitante receberá esta proposta para aprovar ou recusar.';
    reasonWrap.append(reasonLabel, reason);

    const note = document.createElement('p');
    note.className = 'purchase-quantity-note';
    note.textContent = 'A quantidade atual continuará valendo até o solicitante confirmar. O item não poderá ser efetivado como comprado enquanto a proposta estiver pendente.';

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ui-btn ui-btn--outline';
    cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => dialog.close());
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'ui-btn';
    submit.textContent = 'Enviar para confirmação';
    actions.append(cancel, submit);

    form.append(head, itemText, quantities, reasonWrap, note, actions);
    dialog.append(form);
    document.body.append(dialog);

    dialog.openForItem = (item) => {
      form.action = `/compras/solicitacoes/${requestId}/itens/${item.id}/alteracao`;
      itemText.textContent = `${item.item_nome} · ${item.unidade || 'UN'}`;
      current.value = formatQty(item.qtd_solicitada);
      proposed.value = formatQty(item.qtd_solicitada);
      reason.value = '';
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', 'open');
      window.setTimeout(() => proposed.focus(), 0);
    };

    return dialog;
  }

  function decorateQuoteRows(requestId, payload) {
    const pendingByItem = new Map((payload.pendentes || []).map((row) => [Number(row.solicitacao_item_id), row]));
    const dialog = createQuantityDialog(requestId);

    (payload.itens || []).forEach((item) => {
      const hidden = document.querySelector(`#quote-form input[type="hidden"][name="item_id"][value="${item.id}"]`);
      const row = hidden?.closest('tr');
      if (!row) return;
      const actions = row.querySelector('.purchase-row-actions');
      const statusCell = row.querySelector('td[data-label="Status"]');
      const pending = pendingByItem.get(Number(item.id));

      row.classList.toggle('is-alteration-pending', Boolean(pending));
      if (pending) {
        const buy = row.querySelector('.buy-check');
        if (buy) {
          buy.checked = false;
          buy.disabled = true;
          buy.title = 'Compra bloqueada até a decisão do consenso de quantidade.';
        }
        if (statusCell && !statusCell.querySelector('.js-consensus-status')) {
          const badge = document.createElement('span');
          badge.className = 'status-badge consensus-pending js-consensus-status';
          badge.textContent = 'CONSENSO';
          statusCell.append(badge);
        }
        if (actions && !actions.querySelector('.purchase-change-wait-inline')) {
          const wait = document.createElement('small');
          wait.className = 'purchase-change-wait-inline';
          wait.textContent = 'Aguardando decisão';
          actions.append(wait);
        }
        return;
      }

      if (!item.pode_propor_por_compras || !actions || actions.querySelector('.js-propose-quantity')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui-btn ui-btn--outline ui-btn--table js-propose-quantity';
      button.textContent = 'Ajustar qtd.';
      button.title = 'Propor nova quantidade ao solicitante';
      button.addEventListener('click', () => dialog.openForItem(item));
      actions.append(button);
    });
  }

  async function loadItemConsensus() {
    const requestId = getPurchaseRequestId();
    if (!requestId || !document.querySelector('#quote-form')) return;
    ensureConsensusStyles();

    try {
      const response = await fetch(`/compras/solicitacoes/${requestId}/consenso-itens.json`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload?.ok) return;
      renderPendingConsensus(requestId, Array.isArray(payload.pendentes) ? payload.pendentes : []);
      decorateQuoteRows(requestId, payload);

      if (window.location.hash === '#consenso-itens' && payload.pendentes?.length) {
        document.querySelector('#consenso-itens')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
      console.warn('[compras-consenso] Falha ao carregar alterações pendentes:', error?.message || error);
    }
  }

  function init() {
    loadDemandPrequotes();
    loadItemConsensus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
