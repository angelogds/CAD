const TIME_ZONE = process.env.APP_TIMEZONE || 'America/Bahia';
const ACTIVE = new Set(['ABERTA', 'AGUARDANDO_EQUIPE', 'ANDAMENTO', 'EM_ANDAMENTO', 'PAUSADA']);
const CLOSED = new Set(['CONCLUIDA', 'FINALIZADA', 'FECHADA']);

function norm(value) {
  return String(value || '').trim().toUpperCase();
}

function localISO(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function resolvePeriod(query = {}, now = new Date()) {
  const today = localISO(now);
  const key = ['hoje', '7d', '30d', 'mes', 'personalizado'].includes(query.periodo) ? query.periodo : '30d';
  let start = addDays(today, -29);
  let end = today;
  if (key === 'hoje') start = today;
  if (key === '7d') start = addDays(today, -6);
  if (key === 'mes') start = `${today.slice(0, 7)}-01`;
  if (key === 'personalizado' && /^\d{4}-\d{2}-\d{2}$/.test(query.inicio || '') && /^\d{4}-\d{2}-\d{2}$/.test(query.fim || '')) {
    start = query.inicio;
    end = query.fim;
    if (start > end) [start, end] = [end, start];
  }
  return { key, start, end, label: `${start.split('-').reverse().join('/')} a ${end.split('-').reverse().join('/')}` };
}

function dateOnly(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function hoursBetween(from, to = new Date()) {
  const start = Date.parse(String(from || '').replace(' ', 'T'));
  const finish = to instanceof Date ? to.getTime() : Date.parse(String(to || '').replace(' ', 'T'));
  return Number.isFinite(start) && Number.isFinite(finish) && finish >= start ? (finish - start) / 3600000 : null;
}

function distribution(counts) {
  const entries = ['abertas', 'andamento', 'pausadas'].map((key) => ({ key, value: counts[key] || 0 }));
  const total = entries.reduce((sum, item) => sum + item.value, 0);
  let used = 0;
  return entries.map((item, index) => {
    const percent = !total ? 0 : index === entries.length - 1 ? 100 - used : Math.round(item.value * 1000 / total) / 10;
    used += percent;
    return { ...item, percent };
  });
}

function buildOS(osPainel = {}, period, now = new Date(), selectedSector = '') {
  const today = localISO(now);
  const rows = (osPainel.items || []).filter((item) => !selectedSector || norm(item.setor) === norm(selectedSector)).map((item) => {
    const status = norm(item.status);
    const opened = item.abertura || item.opened_at || item.created_at;
    const deadline = dateOnly(item.prazo || item.data_prazo || item.previsao_conclusao);
    const overdue = Boolean(deadline && deadline < today && ACTIVE.has(status));
    const critical = ['CRITICA', 'CRÍTICA', 'CRITICO', 'CRÍTICO', 'EMERGENCIAL'].includes(norm(item.grau || item.criticidade || item.prioridade));
    const openHours = hoursBetween(opened, now);
    const pausedHours = status === 'PAUSADA' ? hoursBetween(item.pausada_em || item.updated_at, now) : null;
    return { ...item, status_normalizado: status, prazo: deadline, atrasada: overdue, critica: critical,
      tempo_aberto_horas: openHours, tempo_pausado_horas: pausedHours,
      motivo_pausa: item.motivo_pausa || item.justificativa_pausa || null,
      ultima_atualizacao: item.updated_at || opened };
  }).filter((item) => ACTIVE.has(item.status_normalizado));
  const order = (item) => item.atrasada ? 0 : item.critica ? 1 : item.status_normalizado === 'PAUSADA' ? 2 : ['ANDAMENTO', 'EM_ANDAMENTO'].includes(item.status_normalizado) ? 3 : 4;
  rows.sort((a, b) => order(a) - order(b) || (Date.parse(a.abertura || a.opened_at || 0) - Date.parse(b.abertura || b.opened_at || 0)));
  const counts = {
    abertas: rows.filter((item) => ['ABERTA', 'AGUARDANDO_EQUIPE'].includes(item.status_normalizado)).length,
    andamento: rows.filter((item) => ['ANDAMENTO', 'EM_ANDAMENTO'].includes(item.status_normalizado)).length,
    pausadas: rows.filter((item) => item.status_normalizado === 'PAUSADA').length,
    atrasadas: rows.filter((item) => item.atrasada).length,
  };
  return { items: rows, counts, totalAtivas: counts.abertas + counts.andamento + counts.pausadas, distribution: distribution(counts), period };
}

function buildPreventivas(raw = {}, now = new Date()) {
  const today = localISO(now);
  const weekEnd = addDays(today, 7);
  const items = (raw.items || []).map((item) => {
    const due = dateOnly(item.data_prevista);
    const status = norm(item.status);
    const completed = ['CONCLUIDA', 'FINALIZADA', 'FECHADA'].includes(status);
    const overdue = Boolean(due && due < today && !completed);
    const dueToday = Boolean(due === today && !completed);
    const dueWeek = Boolean(due && due > today && due <= weekEnd && !completed);
    return { ...item, vencida: overdue, vence_hoje: dueToday, vence_semana: dueWeek, sem_responsavel: !item.responsavel_exibicao || item.responsavel_exibicao === '-' };
  }).sort((a, b) => Number(b.vencida) - Number(a.vencida) || Number(b.vence_hoje) - Number(a.vence_hoje) || Number(norm(b.criticidade) === 'CRITICA') - Number(norm(a.criticidade) === 'CRITICA') || String(a.data_prevista || '').localeCompare(String(b.data_prevista || '')));
  return { ...raw, items, deadlines: {
    vencidas: items.filter((item) => item.vencida).length,
    hoje: items.filter((item) => item.vence_hoje).length,
    semana: items.filter((item) => item.vence_semana).length,
    semResponsavel: items.filter((item) => item.sem_responsavel).length,
  } };
}

function maintenanceIndicators(osItems, preventivas) {
  const repairs = osItems.filter((item) => CLOSED.has(norm(item.status)) && item.opened_at && item.closed_at);
  const repairHours = repairs.map((item) => hoursBetween(item.opened_at, item.closed_at)).filter(Number.isFinite);
  const mttr = repairHours.length ? repairHours.reduce((a, b) => a + b, 0) / repairHours.length : null;
  const planned = preventivas.items || [];
  const completed = planned.filter((item) => CLOSED.has(norm(item.status)));
  const onTime = completed.filter((item) => dateOnly(item.closed_at || item.concluida_em) <= dateOnly(item.data_prevista)).length;
  return {
    mttr, mtbf: null,
    preventiveCompliance: completed.length ? onTime * 100 / completed.length : null,
    recurrenceRate: null, availability: null,
    preventiveCorrective: null,
  };
}

function buildOperationalDashboard({ query = {}, osPainel = {}, preventivas = {}, demandas = {}, criticidade = {}, now = new Date() }) {
  const period = resolvePeriod(query, now);
  const sector = String(query.setor || '').trim();
  const os = buildOS(osPainel, period, now, sector);
  const preventive = buildPreventivas(preventivas, now);
  const critical = (criticidade.ranking || []).slice(0, 5);
  const alerts = [
    os.counts.atrasadas && { type: 'os-atrasadas', count: os.counts.atrasadas, text: 'OS atrasada(s) — requer ação', filter: 'atrasadas' },
    os.items.filter((item) => item.critica).length && { type: 'os-criticas', count: os.items.filter((item) => item.critica).length, text: 'OS crítica(s) aberta(s)', filter: 'criticas' },
    os.counts.pausadas && { type: 'os-pausadas', count: os.counts.pausadas, text: 'OS pausada(s) — verificar motivo', filter: 'pausadas' },
    preventive.deadlines.vencidas && { type: 'prev-vencidas', count: preventive.deadlines.vencidas, text: 'preventiva(s) vencida(s)', target: 'preventivas' },
    preventive.deadlines.hoje && { type: 'prev-hoje', count: preventive.deadlines.hoje, text: 'preventiva(s) vence(m) hoje', target: 'preventivas' },
    preventive.deadlines.semana && { type: 'prev-semana', count: preventive.deadlines.semana, text: 'preventiva(s) vence(m) nesta semana', target: 'preventivas' },
    Number(demandas.paradas) && { type: 'demandas-paradas', count: Number(demandas.paradas), text: 'demanda(s) parada(s)', target: 'demandas' },
  ].filter(Boolean);
  return { period, sector, os, preventivas: preventive, critical, alerts,
    indicators: maintenanceIndicators(osPainel.items || [], preventive),
    updatedAt: new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' }).format(now),
    timezone: TIME_ZONE };
}

module.exports = { TIME_ZONE, resolvePeriod, distribution, buildOS, buildPreventivas, maintenanceIndicators, buildOperationalDashboard };
