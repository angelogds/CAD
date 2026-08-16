(function () {
  const tabs = Array.from(document.querySelectorAll('.assistant-tab'));
  const panels = {
    text: document.getElementById('panel-text'),
    voice: document.getElementById('panel-voice'),
    briefing: document.getElementById('panel-briefing'),
    history: document.getElementById('panel-history'),
  };
  const briefingContent = document.getElementById('briefingContent');
  const briefingRefresh = document.getElementById('briefingRefresh');
  const serverHistory = document.getElementById('serverHistory');
  const historyRefresh = document.getElementById('historyRefresh');
  let briefingLoaded = false;
  let historyLoaded = false;

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function activate(target) {
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === target));
    Object.entries(panels).forEach(([key, panel]) => panel?.classList.toggle('active', key === target));
    if (target === 'briefing' && !briefingLoaded) loadBriefing();
    if (target === 'history' && !historyLoaded) loadHistory();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => activate(tab.dataset.tab)));

  function briefingCard(label, value) {
    const card = el('div', null, 'briefing-card');
    card.appendChild(el('span', label, 'assistant-muted'));
    card.appendChild(el('b', value ?? 0));
    return card;
  }

  function renderBriefing(result) {
    briefingContent.replaceChildren();
    const briefing = result?.briefing || {};
    const indicadores = briefing.indicadores || {};
    const cards = el('div', null, 'briefing-cards');
    [
      ['Backlog', indicadores.backlog],
      ['Acima do SLA', indicadores.acima_sla],
      ['Preventivas vencidas', indicadores.preventivas_vencidas],
      ['Aguardando material', indicadores.aguardando_material],
      ['Riscos altos', indicadores.riscos_altos],
      ['MTTR (h)', indicadores.mttr_horas ?? '-'],
    ].forEach(([label, value]) => cards.appendChild(briefingCard(label, value)));
    briefingContent.appendChild(cards);

    const title = el('h4', 'Prioridades da fila', null);
    title.style.color = '#163828';
    briefingContent.appendChild(title);
    const list = el('div', null, 'briefing-list');
    const rows = Array.isArray(briefing.fila_prioritaria) ? briefing.fila_prioritaria : [];
    if (!rows.length) list.appendChild(el('div', 'Nenhuma OS prioritária encontrada.', 'assistant-muted'));
    rows.slice(0, 8).forEach((row) => {
      const item = el('div', null, 'briefing-item');
      item.appendChild(el('strong', `OS #${row.id} • ${row.equipamento || 'Sem equipamento'}`));
      item.appendChild(el('div', `${row.prioridade || 'MEDIA'} • ${row.status || '-'} • ${row.dias_aberta ?? 0} dia(s) aberta`, 'assistant-muted'));
      if (row.status_solicitacao) item.appendChild(el('div', `Material/solicitação: ${row.status_solicitacao}`, 'assistant-muted'));
      list.appendChild(item);
    });
    briefingContent.appendChild(list);

    const alerts = Array.isArray(briefing.alertas) ? briefing.alertas : [];
    if (alerts.length) {
      const alertTitle = el('h4', 'Alertas operacionais', null);
      alertTitle.style.color = '#163828';
      briefingContent.appendChild(alertTitle);
      const alertList = el('div', null, 'briefing-list');
      alerts.slice(0, 6).forEach((alert) => {
        const item = el('div', null, 'briefing-item');
        item.appendChild(el('strong', `${alert.severidade || 'INFO'} • ${alert.tipo || 'Alerta'}`));
        item.appendChild(el('div', alert.mensagem || 'Sem mensagem.', 'assistant-muted'));
        alertList.appendChild(item);
      });
      briefingContent.appendChild(alertList);
    }
  }

  async function loadBriefing() {
    if (!briefingContent) return;
    briefingContent.replaceChildren(el('div', 'Carregando indicadores reais do PCM...', 'assistant-muted'));
    briefingRefresh && (briefingRefresh.disabled = true);
    try {
      const response = await fetch('/ai/industrial/briefing?periodo_dias=30&sla_dias=7');
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao carregar briefing.');
      renderBriefing(data.result || {});
      briefingLoaded = true;
    } catch (err) {
      briefingContent.replaceChildren(el('div', err?.message || 'Falha ao carregar briefing.', 'assistant-muted'));
    } finally {
      briefingRefresh && (briefingRefresh.disabled = false);
    }
  }

  function renderHistory(items) {
    serverHistory.replaceChildren();
    if (!items.length) {
      serverHistory.appendChild(el('div', 'Nenhuma conversa textual registrada no servidor.', 'assistant-muted'));
      return;
    }
    items.forEach((row) => {
      const item = el('div', null, 'history-server-item');
      item.appendChild(el('time', row.created_at || ''));
      item.appendChild(el('strong', row.message || 'Pergunta'));
      const answer = el('div', row.response || 'Sem resposta.');
      answer.style.marginTop = '8px';
      answer.style.whiteSpace = 'pre-wrap';
      item.appendChild(answer);
      const tools = Array.isArray(row?.context?.tools) ? row.context.tools.filter((tool) => tool?.ok).map((tool) => tool.name) : [];
      if (tools.length) item.appendChild(el('div', `Consultas: ${[...new Set(tools)].join(', ')}`, 'assistant-muted'));
      const sources = Array.isArray(row?.context?.sources) ? row.context.sources.map((source) => source?.source).filter(Boolean) : [];
      if (sources.length) item.appendChild(el('div', `Fontes do sistema: ${[...new Set(sources)].join(' • ')}`, 'assistant-muted'));
      serverHistory.appendChild(item);
    });
  }

  async function loadHistory() {
    if (!serverHistory) return;
    serverHistory.replaceChildren(el('div', 'Carregando seu histórico...', 'assistant-muted'));
    historyRefresh && (historyRefresh.disabled = true);
    try {
      const response = await fetch('/ai/industrial/history?limit=40');
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao carregar histórico.');
      renderHistory(Array.isArray(data.items) ? data.items : []);
      historyLoaded = true;
    } catch (err) {
      serverHistory.replaceChildren(el('div', err?.message || 'Falha ao carregar histórico.', 'assistant-muted'));
    } finally {
      historyRefresh && (historyRefresh.disabled = false);
    }
  }

  briefingRefresh?.addEventListener('click', () => { briefingLoaded = false; loadBriefing(); });
  historyRefresh?.addEventListener('click', () => { historyLoaded = false; loadHistory(); });
})();
