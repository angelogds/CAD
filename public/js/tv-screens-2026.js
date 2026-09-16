(() => {
  'use strict';

  const VERSION = '2026.09-v3.1';
  const $screen = (name) => document.querySelector(`[data-tv-screen="${name}"]`);
  const items = (value) => Array.isArray(value) ? value : [];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
  const plain = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const normalizedKey = (value) => plain(value).replace(/[\s-]+/g, '_');
  const numberBR = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const dateBR = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada';
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';
  const clampPercent = (value) => Math.max(0, Math.min(100, Number(value ?? 0)));

  let scheduled = false;

  function metric(label, value, tone = '', detail = '') {
    return `<article class="metric ${tone}"><strong>${esc(value)}</strong><span>${esc(label)}</span>${detail ? `<small>${esc(detail)}</small>` : ''}</article>`;
  }

  function metrics(values) {
    return `<div class="metrics tv-v3-metrics">${values.map((entry) => metric(...entry)).join('')}</div>`;
  }

  function priorityTone(value) {
    const p = normalizedKey(value);
    if (!p || p === 'NAO_INFORMADA' || p.startsWith('NAO_CRIT')) return 'neutral';
    if (['CRITICA', 'CRITICO', 'URGENTE', 'EMERGENCIAL'].includes(p)) return 'danger';
    if (['ALTA', 'ALTO'].includes(p) || p.includes('ALTA')) return 'warning';
    if (['MEDIA', 'MEDIO'].includes(p) || p.includes('MEDIA')) return 'info';
    return 'success';
  }

  function isHighCriticality(value) {
    const p = normalizedKey(value);
    return ['CRITICA', 'CRITICO', 'ALTA', 'ALTO', 'CRITICIDADE_ALTA'].includes(p);
  }

  function preventiveState(value) {
    if (!value) return { label: 'SEM DATA', cls: 'neutral' };
    const raw = String(value).slice(0, 10);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (raw < todayKey) return { label: 'VENCIDA', cls: 'danger' };
    if (raw === todayKey) return { label: 'HOJE', cls: 'warning' };
    return { label: 'PROGRAMADA', cls: 'success' };
  }

  function renderPreventivas(data) {
    const m = data?.operacao?.preventivas || {};
    const preventive = items(data?.preventivas).slice(0, 7);
    const pctPreventive = clampPercent(m.percentualPreventivas ?? 0);
    const pctCorrective = clampPercent(m.percentualCorretivas ?? (100 - pctPreventive));
    const rows = preventive.map((p) => {
      const state = preventiveState(p.dataPrevista);
      return `<tr>
        <td><div class="tv-v3-equipment"><strong>${esc(p.equipamento || 'Equipamento não informado')}</strong><small>${esc(p.setor || p.local || 'Local não informado')}</small></div></td>
        <td class="tv-v3-task">${esc(p.tarefa || 'Tarefa não informada')}</td>
        <td><span class="tv-v3-person-inline"><i>${esc(initials(p.responsavel))}</i><b>${esc(p.responsavel || 'A definir')}</b></span></td>
        <td><strong>${esc(dateBR(p.dataPrevista))}</strong></td>
        <td><span class="badge ${priorityTone(p.criticidade)}">${esc(p.criticidade || 'NÃO INFORMADA')}</span></td>
        <td><span class="tv-v3-state ${state.cls}">${esc(state.label)}</span></td>
      </tr>`;
    }).join('');

    return `<div class="screen tv-v3-root tv-v3-screen section-stack">
      ${metrics([
        ['Pendentes', m.pendentes || 0, '', 'Plano atual'],
        ['Vencidas', m.vencidas || 0, 'danger', 'Exigem atenção'],
        ['Vencendo hoje', m.hoje || 0, 'warning', 'Programação do dia'],
        ['Nesta semana', m.semana || 0, 'info', 'Próximos 7 dias'],
        ['Corretivas abertas', m.corretivas || 0, 'info', 'Carga corretiva'],
        ['Preventivas', `${numberBR(pctPreventive)}%`, 'success', 'Composição'],
      ])}
      <div class="tv-v3-layout tv-v3-preventive-layout">
        <article class="panel tv-v3-overview-panel">
          <div class="panel-heading"><h2>Preventiva × corretiva</h2><span>Composição da manutenção</span></div>
          <div class="tv-v3-donut" style="--preventive-pct:${pctPreventive * 3.6}deg">
            <div><strong>${numberBR(pctPreventive)}%</strong><span>preventivas</span></div>
          </div>
          <div class="tv-v3-legend"><span><i class="is-preventive"></i>${numberBR(pctPreventive)}% Preventivas</span><span><i class="is-corrective"></i>${numberBR(pctCorrective)}% Corretivas</span></div>
          <div class="tv-v3-alert-stack">
            <div class="tv-v3-alert-item danger"><strong>${Number(m.vencidas || 0)}</strong><span>preventivas vencidas</span></div>
            <div class="tv-v3-alert-item warning"><strong>${Number(m.hoje || 0)}</strong><span>programadas para hoje</span></div>
            <div class="tv-v3-alert-item info"><strong>${Number(m.semana || 0)}</strong><span>previstas nesta semana</span></div>
          </div>
        </article>
        <article class="panel tv-v3-table-panel">
          <div class="panel-heading"><h2>Próximas preventivas</h2><span>Programação operacional</span></div>
          <div class="table-wrap"><table class="tv-v3-table preventive-table"><thead><tr><th>Equipamento / Local</th><th>Tarefa</th><th>Responsável</th><th>Data prevista</th><th>Criticidade</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table></div>
          ${rows ? '' : '<div class="empty">Nenhuma preventiva programada.</div>'}
        </article>
      </div>
    </div>`;
  }

  function normalizePeople(list) {
    const map = new Map();
    items(list).forEach((p) => {
      if (!p) return;
      const key = plain(p.nome || p.name || p);
      if (!key) return;
      map.set(key, typeof p === 'string' ? { nome: p } : p);
    });
    return [...map.values()];
  }

  function personStatus(p) {
    const situation = normalizedKey(p?.situacao);
    if (situation === 'OCUPADO') return { label: p.osAtual ? `EM ${p.osAtual}` : 'EM ATENDIMENTO', cls: 'busy' };
    if (situation === 'DISPONIVEL') return { label: 'DISPONÍVEL', cls: 'available' };
    if (situation.includes('AFAST') || situation.includes('FOLGA') || situation === 'INDISPONIVEL') return { label: p.situacao || 'INDISPONÍVEL', cls: 'off' };
    return { label: p?.situacao || 'ESCALA', cls: 'neutral' };
  }

  function personPhoto(p) {
    const fallback = esc(initials(p?.nome));
    if (!p?.foto) return `<span>${fallback}</span>`;
    return `<img src="${esc(p.foto)}" alt="" data-tv-fallback="${fallback}">`;
  }

  function teamRow(p, shift) {
    const s = personStatus(p);
    return `<div class="tv-v3-team-row">
      <div class="tv-v3-person-photo">${personPhoto(p)}</div>
      <div class="tv-v3-team-main"><strong>${esc(p.nome || 'Não informado')}</strong><small>${esc(p.funcao || 'Função não informada')} · ${esc(shift)}</small></div>
      <div class="tv-v3-team-current"><strong>${esc(p.osAtual || (s.cls === 'available' ? 'Livre para atendimento' : 'Sem OS vinculada'))}</strong><small>${s.cls === 'busy' ? 'Atendimento atual' : 'Situação operacional'}</small></div>
      <span class="tv-v3-state ${s.cls}">${esc(s.label)}</span>
    </div>`;
  }

  function bindImageFallbacks(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('.tv-v3-person-photo img[data-tv-fallback]').forEach((img) => {
      if (img.dataset.tvFallbackBound === '1') return;
      img.dataset.tvFallbackBound = '1';
      img.addEventListener('error', () => {
        const span = document.createElement('span');
        span.textContent = img.dataset.tvFallback || '?';
        img.replaceWith(span);
      }, { once: true });
    });
  }

  function simpleNameRows(values, emptyText) {
    const list = items(values);
    if (!list.length) return `<div class="empty">${esc(emptyText)}</div>`;
    return list.map((value) => {
      const person = typeof value === 'string' ? { nome: value } : value;
      return `<div class="tv-v3-mini-row"><span class="tv-v3-mini-avatar">${esc(initials(person.nome))}</span><div><strong>${esc(person.nome || value)}</strong><small>${esc(person.motivo || person.funcao || 'Programação vigente')}</small></div></div>`;
    }).join('');
  }

  function renderEscala(data) {
    const e = data?.escalaVigente;
    if (!e) return '<div class="screen tv-v3-root tv-v3-screen"><article class="panel"><div class="empty">Escala ainda não cadastrada.</div></article></div>';
    const day = normalizePeople(e.dia);
    const night = normalizePeople(e.noite);
    const active = normalizePeople([...day, ...night]);
    const available = active.filter((p) => normalizedKey(p.situacao) === 'DISPONIVEL').length;
    const busy = active.filter((p) => normalizedKey(p.situacao) === 'OCUPADO').length;
    const absent = items(e.afastados).length + items(e.foraEscala).length;
    const weekend = items(e.finalSemana).length;
    const rows = [...day.map((p) => teamRow(p, 'Turno dia')), ...night.map((p) => teamRow(p, 'Turno noite'))].join('');

    return `<div class="screen tv-v3-root tv-v3-screen section-stack">
      ${metrics([
        ['Equipe escalada', active.length, '', 'Dia + noite'],
        ['Disponíveis', available, 'success', 'Livres agora'],
        ['Em atendimento', busy, 'info', 'Com OS atual'],
        ['Turno noite', night.length, '', 'Equipe noturna'],
        ['Final de semana', weekend, 'warning', 'Programados'],
        ['Fora da escala', absent, 'danger', 'Folgas / afastados'],
      ])}
      <div class="tv-v3-layout tv-v3-scale-layout">
        <article class="panel tv-v3-team-panel">
          <div class="panel-heading"><h2>Equipe em campo</h2><span>Distribuição operacional da escala vigente</span></div>
          <div class="tv-v3-team-list">${rows || '<div class="empty">Nenhum colaborador na escala vigente.</div>'}</div>
        </article>
        <div class="tv-v3-side-stack">
          <article class="panel"><div class="panel-heading"><h2>Final de semana</h2><span>Equipe programada</span></div>${simpleNameRows(e.finalSemana, 'Nenhum responsável cadastrado.')}</article>
          <article class="panel"><div class="panel-heading"><h2>Folgas e afastamentos</h2><span>Indisponibilidades registradas</span></div>${simpleNameRows([...items(e.afastados), ...items(e.foraEscala)], 'Nenhum afastamento registrado.')}</article>
        </div>
      </div>
    </div>`;
  }

  function renderDesempenho(data) {
    const ranking = items(data?.rankingEquipe).slice(0, 8);
    if (!ranking.length) return '<div class="screen tv-v3-root tv-v3-screen"><article class="panel"><div class="empty">Sem dados suficientes para o ranking.</div></article></div>';
    const totalFinished = ranking.reduce((sum, r) => sum + Number(r.os_finalizadas || 0), 0);
    const totalCritical = ranking.reduce((sum, r) => sum + Number(r.criticas || 0), 0);
    const totalHigh = ranking.reduce((sum, r) => sum + Number(r.altas || 0), 0);
    const currentLoad = ranking.reduce((sum, r) => sum + Number(r.cargaAtual || 0), 0);
    const averagePoints = ranking.reduce((sum, r) => sum + Number(r.pontos || 0), 0) / Math.max(1, ranking.length);
    const leader = ranking[0] || {};
    const rows = ranking.map((r) => `<tr>
      <td><span class="tv-v3-rank-position">#${Number(r.posicao || 0)}</span></td>
      <td><span class="tv-v3-person-inline"><i>${esc(initials(r.nome))}</i><b>${esc(r.nome || 'Não informado')}</b></span></td>
      <td><strong>${Number(r.os_finalizadas || 0)}</strong></td>
      <td>${Number(r.criticas || 0)}</td>
      <td>${Number(r.altas || 0)}</td>
      <td><strong>${Number(r.pontos || 0).toFixed(2)}</strong></td>
      <td><span class="tv-v3-state ${Number(r.cargaAtual || 0) ? 'busy' : 'available'}">${Number(r.cargaAtual || 0)} OS</span></td>
    </tr>`).join('');

    return `<div class="screen tv-v3-root tv-v3-screen section-stack">
      ${metrics([
        ['Equipe avaliada', ranking.length, '', 'Ranking mensal'],
        ['OS finalizadas', totalFinished, 'success', 'Equipe exibida'],
        ['Críticas atendidas', totalCritical, 'danger', 'No período'],
        ['Altas atendidas', totalHigh, 'warning', 'No período'],
        ['Carga atual', currentLoad, 'info', 'OS em andamento'],
        ['Média de pontos', averagePoints.toFixed(2), '', 'Equipe exibida'],
      ])}
      <div class="tv-v3-layout tv-v3-performance-layout">
        <article class="panel tv-v3-table-panel">
          <div class="panel-heading"><h2>Desempenho mensal da equipe</h2><span>Produção e carga atual</span></div>
          <div class="table-wrap"><table class="tv-v3-table performance-table"><thead><tr><th>Pos.</th><th>Colaborador</th><th>OS finalizadas</th><th>Críticas</th><th>Altas</th><th>Pontos</th><th>Carga atual</th></tr></thead><tbody>${rows}</tbody></table></div>
        </article>
        <div class="tv-v3-side-stack">
          <article class="panel tv-v3-highlight-card"><span>Destaque do período</span><strong>${esc(leader.nome || '—')}</strong><small>${Number(leader.os_finalizadas || 0)} OS finalizadas · ${Number(leader.pontos || 0).toFixed(2)} pontos</small></article>
          <article class="panel"><div class="panel-heading"><h2>Carga atual</h2><span>OS em andamento por colaborador</span></div>${ranking.slice(0, 5).map((r) => `<div class="tv-v3-load-row"><span>${esc(r.nome)}</span><i><b style="width:${Math.min(100, Number(r.cargaAtual || 0) * 20)}%"></b></i><strong>${Number(r.cargaAtual || 0)}</strong></div>`).join('')}</article>
        </div>
      </div>
    </div>`;
  }

  function renderCriticidade(data) {
    const equipment = items(data?.operacao?.equipamentos).slice(0, 8);
    const totalFailures = equipment.reduce((sum, e) => sum + Number(e.falhas || 0), 0);
    const totalRecurrences = equipment.reduce((sum, e) => sum + Number(e.reincidencias || 0), 0);
    const critical = equipment.filter((e) => isHighCriticality(e.criticidade)).length;
    const stopped = equipment.filter((e) => /PARAD|INDISPON/i.test(String(e.situacao || ''))).length;
    const maxFailures = Math.max(1, ...equipment.map((e) => Number(e.falhas || 0)));
    const top = [...equipment].sort((a, b) => Number(b.falhas || 0) - Number(a.falhas || 0)).slice(0, 5);
    const rows = equipment.map((e) => `<tr>
      <td><div class="tv-v3-equipment"><strong>${esc(e.nome || 'Equipamento não informado')}</strong><small>${esc(e.setor || e.local || 'Histórico de falhas')}</small></div></td>
      <td><strong>${Number(e.falhas || 0)}</strong></td>
      <td>${Number(e.reincidencias || 0)}</td>
      <td>${esc(e.mtbf || 'Dados insuficientes')}</td>
      <td><span class="badge ${priorityTone(e.criticidade)}">${esc(e.criticidade || 'NÃO INFORMADA')}</span></td>
      <td><span class="tv-v3-state ${/PARAD|INDISPON/i.test(String(e.situacao || '')) ? 'danger' : 'available'}">${esc(e.situacao || 'Sem ocorrência ativa')}</span></td>
    </tr>`).join('');

    return `<div class="screen tv-v3-root tv-v3-screen section-stack">
      ${metrics([
        ['Equipamentos analisados', equipment.length, '', 'Com histórico'],
        ['Falhas registradas', totalFailures, 'danger', 'Base exibida'],
        ['Reincidências', totalRecurrences, 'warning', 'Falhas repetidas'],
        ['Criticidade alta', critical, 'danger', 'Equipamentos críticos'],
        ['Parados / indisponíveis', stopped, 'danger', 'Situação atual'],
        ['Maior incidência', top[0]?.falhas || 0, 'info', top[0]?.nome || 'Sem dados'],
      ])}
      <div class="tv-v3-layout tv-v3-critical-layout">
        <article class="panel tv-v3-failure-panel">
          <div class="panel-heading"><h2>Top 5 — incidência de falhas</h2><span>Equipamentos com maior recorrência</span></div>
          <div class="tv-v3-failure-list">${top.map((e, index) => `<div class="tv-v3-failure-row"><span class="tv-v3-rank-position">#${index + 1}</span><div><strong>${esc(e.nome)}</strong><small>${Number(e.reincidencias || 0)} reincidência(s)</small></div><i><b style="width:${Number(e.falhas || 0) / maxFailures * 100}%"></b></i><strong>${Number(e.falhas || 0)}</strong></div>`).join('') || '<div class="empty">Sem dados suficientes de falhas.</div>'}</div>
        </article>
        <article class="panel tv-v3-table-panel">
          <div class="panel-heading"><h2>Criticidade dos equipamentos</h2><span>Falhas, reincidência, MTBF e situação</span></div>
          <div class="table-wrap"><table class="tv-v3-table critical-table"><thead><tr><th>Equipamento</th><th>Falhas</th><th>Reincid.</th><th>MTBF</th><th>Criticidade</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table></div>
          ${rows ? '' : '<div class="empty">Nenhuma ocorrência registrada.</div>'}
        </article>
      </div>
    </div>`;
  }

  const renderers = {
    preventivas: renderPreventivas,
    escala: renderEscala,
    desempenho: renderDesempenho,
    criticidade: renderCriticidade,
  };

  function signature(name, data) {
    const subset = name === 'preventivas'
      ? [data?.operacao?.preventivas, data?.preventivas]
      : name === 'escala'
        ? data?.escalaVigente
        : name === 'desempenho'
          ? data?.rankingEquipe
          : data?.operacao?.equipamentos;
    try { return JSON.stringify(subset); } catch (_error) { return String(Date.now()); }
  }

  function modernize() {
    const data = window.CGTVTest?.state?.data;
    if (!data) return;

    Object.entries(renderers).forEach(([name, renderer]) => {
      const el = $screen(name);
      if (!el) return;
      const sig = `${VERSION}:${signature(name, data)}`;
      if (el.querySelector('.tv-v3-root') && el.dataset.tvV3Signature === sig) return;
      el.dataset.tvV3Signature = sig;
      el.innerHTML = renderer(data);
      bindImageFallbacks(el);
    });
  }

  function scheduleModernize() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      modernize();
    });
  }

  function init() {
    const root = document.getElementById('tvContent');
    if (!root) return;
    const observer = new MutationObserver(scheduleModernize);
    observer.observe(root, { childList: true, subtree: true });
    scheduleModernize();
    window.CGTVScreens2026 = { modernize, renderers, VERSION };
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();