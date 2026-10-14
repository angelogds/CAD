(() => {
  function normalizeToken(value) {
    return String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function isReciclagemSelecionada() {
    const setor = new URLSearchParams(window.location.search).get('setor');
    return ['RECICLAGEM', 'MANUTENCAO', 'PRODUCAO'].includes(normalizeToken(setor));
  }

  async function loadDemandPrequotes() {
    if (!isReciclagemSelecionada()) return;
    const dashboard = document.querySelector('.purchase-dashboard');
    if (!dashboard || document.querySelector('.demand-prequote-panel')) return;

    let rows = [];
    let demandasSemMateriais = [];
    try {
      const response = await fetch('/compras/demandas/pre-cotacoes.json', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      rows = Array.isArray(payload?.rows) ? payload.rows : [];
      demandasSemMateriais = Array.isArray(payload?.demandasSemMateriais) ? payload.demandasSemMateriais : [];
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
    title.textContent = 'Pré-solicitações de Demandas';
    const description = document.createElement('p');
    description.textContent = 'Materiais das Demandas ainda não liberadas: Compras prepara preços e fornecedores aqui. Quando a compra for autorizada na Demanda, a solicitação entra na lista por criticidade, preservando a cotação.';
    copy.append(kicker, title, description);

    const count = document.createElement('div');
    count.className = 'demand-prequote-count';
    const countValue = document.createElement('strong');
    countValue.textContent = String(rows.length + demandasSemMateriais.length);
    const countLabel = document.createElement('span');
    countLabel.textContent = 'registros de planejamento';
    count.append(countValue, countLabel);
    head.append(copy, count);
    section.append(head);

    if (!rows.length && !demandasSemMateriais.length) {
      const empty = document.createElement('div');
      empty.className = 'demand-prequote-empty';
      empty.textContent = 'Nenhuma pré-cotação pendente encontrada. Cadastre os materiais na aba Materiais de uma Demanda da Reciclagem.';
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
        const details = [row.prioridade ? `Criticidade: ${row.prioridade}` : '', row.equipamento_nome || '', row.nr_referencia ? `NR: ${row.nr_referencia}` : '', row.aprovacao_status ? `Execução: ${row.aprovacao_status}` : ''].filter(Boolean);
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
        gateStatus.textContent = 'Pré-cotação em preparação';
        const gatePurchase = document.createElement('small');
        gatePurchase.textContent = 'Compra aguardando liberação';
        const action = document.createElement('a');
        action.href = `/compras/solicitacoes/${row.id}`;
        action.className = 'ui-btn ui-btn--table';
        action.textContent = 'Abrir e preparar cotação';
        gate.append(gateStatus, gatePurchase, action);

        article.append(main, progress, gate);
        list.append(article);
      });

      if (rows.length) section.append(list);

      if (demandasSemMateriais.length) {
        const waitingBlock = document.createElement('div');
        waitingBlock.className = 'demand-prequote-unplanned';
        const subheading = document.createElement('h3');
        subheading.textContent = 'Demandas aguardando materiais';
        const hint = document.createElement('p');
        hint.textContent = 'Essas Demandas ainda não têm solicitação de materiais vinculada. Abra o planejamento, cadastre os materiais e Compras poderá preparar a pré-cotação.';
        waitingBlock.append(subheading, hint);

        const waitingList = document.createElement('div');
        waitingList.className = 'demand-prequote-list';
        demandasSemMateriais.forEach((demand) => {
          const article = document.createElement('article');
          article.className = 'demand-prequote-row';
          const main = document.createElement('div');
          main.className = 'demand-prequote-main';
          const title = document.createElement('a');
          title.href = `/demandas/${demand.demanda_id}#materiais`;
          title.textContent = `Demanda #${demand.demanda_id} — ${demand.demanda_titulo || 'Planejamento de materiais'}`;
          const meta = document.createElement('small');
          meta.textContent = [
            demand.demanda_prioridade ? `Criticidade: ${demand.demanda_prioridade}` : '',
            demand.equipamento_nome || '',
            demand.setor_origem || 'Setor de origem a confirmar'
          ].filter(Boolean).join(' • ');
          main.append(title, meta);

          const progress = document.createElement('div');
          progress.className = 'demand-prequote-progress';
          const progressText = document.createElement('strong');
          progressText.textContent = 'Sem solicitação de materiais';
          progress.append(progressText);

          const actions = document.createElement('div');
          actions.className = 'demand-prequote-gate';
          const state = document.createElement('small');
          state.textContent = 'Não é uma cotação: o levantamento ainda precisa ser cadastrado.';
          const action = document.createElement('a');
          action.className = 'ui-btn ui-btn--table';
          action.href = `/demandas/${demand.demanda_id}#materiais`;
          action.textContent = 'Planejar materiais';
          actions.append(state, action);

          article.append(main, progress, actions);
          waitingList.append(article);
        });
        waitingBlock.append(waitingList);
        section.append(waitingBlock);
      }
    }

    const attention = dashboard.querySelector('.attention-card');
    if (attention) dashboard.insertBefore(section, attention);
    else dashboard.append(section);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadDemandPrequotes);
  else loadDemandPrequotes();
})();
