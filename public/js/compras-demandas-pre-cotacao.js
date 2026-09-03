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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadDemandPrequotes);
  else loadDemandPrequotes();
})();
