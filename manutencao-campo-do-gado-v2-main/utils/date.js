// utils/date.js
const TZ = process.env.TZ || "America/Sao_Paulo";

function toDate(value) {
  if (!value) return null;
  // aceita Date, ISO, "YYYY-MM-DD HH:mm:ss"
  const d = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function fmtBR(value) {
  const d = toDate(value);
  if (!d) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtDateBR(value) {
  const d = toDate(value);
  if (!d) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

module.exports = { TZ, fmtBR, fmtDateBR };
