// Calendário nacional: pontos facultativos não suspendem a manutenção.
const TIME_ZONE = 'America/Bahia';
const FERIADOS_FIXOS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);

function partesLocais(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute) };
}

function normalizarRegra(input = {}) {
  const horario = input.horario ?? '05:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) throw new Error('Informe um horário válido (HH:MM).');
  const datas = Array.isArray(input.feriadosLocais) ? input.feriadosLocais : String(input.feriadosLocais || '').split(/[\s,;]+/).filter(Boolean);
  if (datas.length > 100) throw new Error('Cadastre no máximo 100 datas de feriados locais.');
  for (const data of datas) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(data) ? new Date(`${data}T12:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== data) {
      throw new Error('Informe os feriados locais no formato AAAA-MM-DD, um por linha.');
    }
  }
  return { horario, adiarFeriados: input.adiarFeriados !== false, feriadosLocais: [...new Set(datas)].sort() };
}

function lerRegra(db) {
  let raw;
  try { raw = db.prepare('SELECT valor FROM config_sistema WHERE chave = ?').get('preventiva_lancamento_regra')?.valor; }
  catch (_) { return normalizarRegra(); }
  try { return normalizarRegra(raw ? JSON.parse(raw) : {}); }
  catch (_) { return normalizarRegra(); }
}

function somarDias(data, dias) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function sextaPaixao(ano) {
  // Computus gregoriano: Páscoa menos dois dias.
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = (h + l - 7 * m + 114) % 31 + 1;
  return somarDias(`${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, -2);
}

function isFeriadoNacional(data) {
  return FERIADOS_FIXOS.has(data.slice(5)) || data === sextaPaixao(Number(data.slice(0, 4)));
}

function isFeriado(data, regra) {
  return regra.adiarFeriados && (isFeriadoNacional(data) || regra.feriadosLocais.includes(data));
}

function proximoDiaUtil(data, options = {}) {
  const regra = normalizarRegra(options);
  let dia = data;
  while ([0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay()) || isFeriado(dia, regra)) {
    dia = somarDias(dia, 1);
  }
  return dia;
}

function janelaDiaria(refDate = new Date(), options = {}) {
  const regra = normalizarRegra(options);
  const { data: dataHoje, hora, minuto } = partesLocais(refDate);
  const [h, m] = regra.horario.split(':').map(Number);
  const reason = isFeriado(dataHoje, regra) ? 'holiday' : hora * 60 + minuto < h * 60 + m ? 'before_scheduled_time' : null;
  return { dataHoje, permitido: reason === null, reason, horario: regra.horario,
    message: reason === 'holiday' ? 'Lançamento de preventivas adiado por feriado.' : reason ? `As OSs preventivas só podem ser lançadas a partir das ${regra.horario} (Bahia).` : null };
}

function janelaLancamento(refDate = new Date(), options = {}) {
  const regra = normalizarRegra(options);
  const diaria = janelaDiaria(refDate, regra);
  const { dataHoje } = diaria;
  const diaSemana = new Date(`${dataHoje}T12:00:00Z`).getUTCDay();
  const dataSegunda = somarDias(dataHoje, -((diaSemana + 6) % 7));
  const dataLancamento = proximoDiaUtil(dataSegunda, regra);
  let reason = null;
  if (dataHoje < dataLancamento) reason = 'before_scheduled_date';
  else if (diaria.reason) reason = diaria.reason;
  else if ([0, 6].includes(diaSemana)) reason = 'non_working_day';
  // Se o servidor esteve desligado às 5h, recupera a semana no próximo expediente.
  return { dataHoje, dataSegunda, dataLancamento, permitido: reason === null, reason, horario: regra.horario,
    message: reason ? diaria.message || `Lançamento semanal previsto para ${dataLancamento} a partir das ${regra.horario} (Bahia), em dia útil.` : null };
}

function validarLancamento(db, refDate = new Date()) {
  const janela = janelaDiaria(refDate, lerRegra(db));
  if (!janela.permitido) throw new Error(janela.message);
}

module.exports = { janelaLancamento, janelaDiaria, proximoDiaUtil, isFeriadoNacional, partesLocais, normalizarRegra, lerRegra, validarLancamento };
