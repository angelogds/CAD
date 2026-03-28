const TIME_ZONE = "America/Sao_Paulo";
const TURNO_DIA_INICIO_MIN = 5 * 60;
const TURNO_NOITE_INICIO_MIN = 17 * 60;

function getAgoraSaoPauloParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = Number(map.hour || 0);
  const minute = Number(map.minute || 0);
  return {
    year: Number(map.year || 0),
    month: Number(map.month || 0),
    day: Number(map.day || 0),
    hour,
    minute,
    dateISO: `${map.year}-${map.month}-${map.day}`,
    totalMinutes: (hour * 60) + minute,
  };
}

function getTurnoOperacionalAgora(date = new Date()) {
  const { totalMinutes } = getAgoraSaoPauloParts(date);
  if (totalMinutes >= TURNO_NOITE_INICIO_MIN || totalMinutes < TURNO_DIA_INICIO_MIN) return "NOITE";
  return "DIA";
}

function getTiposTurnoEscala(turno = "DIA") {
  return String(turno || "").toUpperCase() === "NOITE"
    ? ["plantao", "noturno"]
    : ["diurno", "apoio"];
}

module.exports = {
  TIME_ZONE,
  TURNO_DIA_INICIO_MIN,
  TURNO_NOITE_INICIO_MIN,
  getAgoraSaoPauloParts,
  getTurnoOperacionalAgora,
  getTiposTurnoEscala,
};
