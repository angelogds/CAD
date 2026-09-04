const { TIME_ZONE, getAgoraSaoPauloParts } = require('./turno-operacional');

function todayISO(date = new Date()) {
  return getAgoraSaoPauloParts(date).dateISO;
}

function isValidISODate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isMondayISO(value) {
  if (!isValidISODate(value)) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() === 1;
}

function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatParts(date) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function formatDateBR(value) {
  if (!value) return '-';
  const raw = String(value).trim();
  if (isValidISODate(raw.slice(0, 10)) && raw.length <= 10) {
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = parseTimestamp(value);
  if (!date) {
    const iso = raw.slice(0, 10);
    if (isValidISODate(iso)) {
      const [year, month, day] = iso.split('-');
      return `${day}/${month}/${year}`;
    }
    return raw || '-';
  }
  const p = formatParts(date);
  return `${p.day}/${p.month}/${p.year}`;
}

function formatDateTimeBR(value) {
  const date = parseTimestamp(value);
  if (!date) return formatDateBR(value);
  const p = formatParts(date);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function formatTimeBR(value) {
  const date = parseTimestamp(value);
  if (!date) return '-';
  const p = formatParts(date);
  return `${p.hour}:${p.minute}`;
}

module.exports = {
  TIME_ZONE,
  todayISO,
  isValidISODate,
  isMondayISO,
  formatDateBR,
  formatDateTimeBR,
  formatTimeBR,
};
