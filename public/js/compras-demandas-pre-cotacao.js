(() => {
  const INITIAL_VISIBLE = 5;

  function normalizeToken(value) {
    return String(value || '').trim().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  function isReciclagemSelecionada() {
    const setor = new URLSearchParams(window.location.search).get('setor');
    return ['RECICLAGEM', 'MANUTENCAO', 'PRODUCAO'].includes(normalizeToken(setor));
  }

  function addPrequoteRow(list, row) {
    const total = Number(row.itens_count || 0);
    const quoted = Number(row.itens_cotados || 0);
    const pct = total ? Math.min(100, Math.round((quoted / total) * 100)) : 0;
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
    meta.textContent = [
      row.prioridade ? `Criticidade: ${row.prioridade}` : '',
      row.equipamento_nome || '',
      row.nr_referencia ? `NR: ${row.nr_referencia}` : '',
      row.os_id ? `OS #${row.os_id}` : '',
    ].filter(Boolean).join(' • ') || 'Demanda em planejamento';
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
    gateStatus.textContent = quoted === total && total > 0 ? 'Pré-cotação preparada' : 'Pré-cotação em preparação';
    const gatePurchase = document.createElement('small');
    gatePurchase.textContent = 'Compra aguardando liberação da Demanda';
    const action = document.createElement('a');
    action.href = `/compras/solicitacoes/${row.id}`;
    action.className = 'ui-btn ui-btn--table';
    action.textContent = 'Abrir cotação';
    gate.append(gateStatus, gatePurchase, action);

    article.append(main, progress, gate);
    list.append(article);
  }

  async function loadDemandPrequotes() {
    if (!isReciclagemSelecionada()) return;
    const dashboard = document.querySelector('.purchase-dashboard');
    if (!dashboard || document.querySelector('.demand-prequote-panel')) return;

    let initialRows;
    let total;
    try {
      const response = await fetch('/compras/demandas/pre-cotacoes.json', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload?.ok) return;
      initialRows = Array.isArray(payload.rows) ? payload.rows : [];
      total = Math.max(initialRows.length, Number(payload.total) || 0);
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
    description.textContent = 'Apenas solicitações de materiais já cadastradas nas Demandas. Compras pode preparar preços e fornecedores; após a liberação, a solicitação passa para a fila por criticidade.';
    copy.append(kicker, title, description);

    const count = document.createElement('div');
    count.className = 'demand-prequote-count';
    const countValue = document.createElement('strong');
    countValue.textContent = String(total);
    const countLabel = document.createElement('span');
    countLabel.textContent = total === 1 ? 'pré-cotação disponível' : 'pré-cotações disponíveis';
    count.append(countValue, countLabel);
    head.append(copy, count);
    section.append(head);

    if (!total) {
      const empty = document.createElement('div');
      empty.className = 'demand-prequote-empty';
      empty.textContent = 'Nenhuma solicitação de materiais de Demanda aguardando pré-cotação no momento.';
      section.append(empty);

      const check = document.createElement('button');
      check.type = 'button';
      check.className = 'ui-btn ui-btn--table';
      check.textContent = 'Verificar vínculos das solicitações';
      check.style.marginTop = '10px';
      const feedback = document.createElement('div');
      feedback.className = 'demand-prequote-diagnostic';
      feedback.setAttribute('role', 'status');

      check.addEventListener('click', async () => {
        check.disabled = true;
        feedback.textContent = 'Conferindo cadastros de materiais, OS e Demandas...';
        try {
          const response = await fetch('/compras/demandas/pre-cotacoes.json?diagnostico=1', {
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error('Consulta indisponível');
          const payload = await response.json();
          const info = payload?.diagnostico;
          if (!info?.disponivel) throw new Error('Tabelas não disponíveis');
          const counts = info.contagens || {};
          const rows = [
            ['Solicitações com materiais no sistema', counts.solicitacoes_com_materiais],
            ['Solicitações com OS e materiais', counts.solicitacoes_com_os_e_materiais],
            ['Solicitações com OS, mas sem vínculo de Demanda', counts.solicitacoes_com_os_sem_vinculo_demanda],
            ['Solicitações com materiais ligadas a Demandas', counts.solicitacoes_vinculadas_demanda_com_materiais],
            ['Vinculadas à Reciclagem', counts.vinculadas_demanda_reciclagem],
            ['Reciclagem aguardando liberação', counts.vinculadas_demanda_reciclagem_pendentes],
            ['Reciclagem já liberadas', counts.vinculadas_demanda_reciclagem_liberadas],
            ['Pendentes excluídas por status', counts.candidatas_excluidas_pelo_status],
            ['Pré-cotações elegíveis para o card', counts.pre_cotacoes_visiveis_no_card],
          ];
          feedback.replaceChildren();
          const label = document.createElement('strong');
          label.textContent = 'Diagnóstico de vínculos (somente leitura)';
          const ul = document.createElement('ul');
          for (const [key,value] of rows) {
            const li = document.createElement('li');
            li.textContent = key + ': ' + Number(value || 0);
            ul.append(li);
          }
          feedback.append(label, ul);
          if (Array.isArray(info.exemplos_os_sem_demanda) && info.exemplos_os_sem_demanda.length) {
            const samples=document.createElement('p');
            samples.textContent = 'Exemplos sem vínculo: ' + info.exemplos_os_sem_demanda
              .map(s => 'Solicitação #' + s.solicitacao_id + ' / OS #' + s.os_id).join('; ');
            feedback.append(samples);
          }
          const textToCopy = rows.map(([key,value]) => key+': '+Number(value||0)).join('\n')
            + '\n' + (info.exemplos_os_sem_demanda || [])
              .map(s => 'Solicitação #'+s.solicitacao_id+' / OS #'+s.os_id).join('; ');
          const copy = document.createElement('button');
          copy.type='button';
          copy.className='ui-btn ui-btn--table';
          copy.textContent='Copiar diagnóstico';
          copy.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(textToCopy); copy.textContent='Copiado'; }
            catch { copy.textContent='Selecione o texto acima para copiar'; }
          });
          feedback.append(copy);
        } catch (_error) {
          feedback.textContent = 'Não foi possível conferir os vínculos agora. Atualize a página e tente novamente.';
        } finally {
          check.disabled = false;
        }
      });
      section.append(check, feedback);
    } else {
      const list = document.createElement('div');
      list.className = 'demand-prequote-list';
      list.id = 'demand-prequote-items';
      initialRows.slice(0, INITIAL_VISIBLE).forEach(row => addPrequoteRow(list, row));
      section.append(list);

      if (total > INITIAL_VISIBLE) {
        const actions = document.createElement('div');
        actions.className = 'demand-prequote-footer';
        const summary = document.createElement('span');
        summary.textContent = `Exibindo ${Math.min(INITIAL_VISIBLE, total)} de ${total} pré-cotações`;
        const toggle = document.createElement('button');
        toggle.className = 'ui-btn ui-btn--table';
        toggle.type = 'button';
        toggle.setAttribute('aria-controls', list.id);
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = `Abrir todas as pré-cotações (${total})`;
        const status = document.createElement('span');
        status.className = 'demand-prequote-load-error';
        status.setAttribute('role', 'status');
        let expanded = false;
        let allRows = null;
        toggle.addEventListener('click', async () => {
          if (expanded) {
            list.replaceChildren();
            initialRows.slice(0, INITIAL_VISIBLE).forEach(row => addPrequoteRow(list, row));
            expanded = false;
            toggle.setAttribute('aria-expanded', 'false');
            toggle.textContent = `Abrir todas as pré-cotações (${total})`;
            summary.textContent = `Exibindo ${Math.min(INITIAL_VISIBLE, total)} de ${total} pré-cotações`;
            return;
          }
          toggle.disabled = true;
          toggle.textContent = 'Carregando pré-cotações...';
          status.textContent = '';
          try {
            if (!allRows) {
              const response = await fetch('/compras/demandas/pre-cotacoes.json?todas=1', {
                headers: { Accept: 'application/json' },
              });
              if (!response.ok) throw new Error('Falha no carregamento');
              const payload = await response.json();
              if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Resposta inválida');
              allRows = payload.rows;
            }
            list.replaceChildren();
            allRows.forEach(row => addPrequoteRow(list, row));
            expanded = true;
            toggle.setAttribute('aria-expanded', 'true');
            toggle.textContent = 'Mostrar apenas 5';
            summary.textContent = `Exibindo ${allRows.length} pré-cotações`;
          } catch (_error) {
            status.textContent = 'Não foi possível abrir todas as pré-cotações. Tente novamente.';
            toggle.textContent = `Abrir todas as pré-cotações (${total})`;
          } finally {
            toggle.disabled = false;
          }
        });
        actions.append(summary, toggle, status);
        section.append(actions);
      }
    }
    const attention = dashboard.querySelector('.attention-card');
    if (attention) dashboard.insertBefore(section, attention);
    else dashboard.append(section);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadDemandPrequotes);
  else loadDemandPrequotes();
})();
