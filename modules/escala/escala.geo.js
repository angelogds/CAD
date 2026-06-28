const STATUS_LOCALIZACAO = Object.freeze({
  DENTRO_DA_UNIDADE: 'DENTRO_DA_UNIDADE',
  PROXIMO_DA_UNIDADE: 'PROXIMO_DA_UNIDADE',
  FORA_DA_AREA: 'FORA_DA_AREA',
  NAO_AUTORIZADA: 'NAO_AUTORIZADA',
  GPS_INDISPONIVEL: 'GPS_INDISPONIVEL',
  NAO_CAPTURADA: 'NAO_CAPTURADA',
});

const GEO_UNIDADE_CAMPO_DO_GADO = Object.freeze({
  nome: process.env.GEO_UNIDADE_CAMPO_DO_GADO_NOME || 'Campo do Gado - Reciclagem',
  latitude: process.env.GEO_UNIDADE_CAMPO_DO_GADO_LATITUDE ? Number(process.env.GEO_UNIDADE_CAMPO_DO_GADO_LATITUDE) : null,
  longitude: process.env.GEO_UNIDADE_CAMPO_DO_GADO_LONGITUDE ? Number(process.env.GEO_UNIDADE_CAMPO_DO_GADO_LONGITUDE) : null,
  raioPermitidoMetros: Number(process.env.GEO_UNIDADE_CAMPO_DO_GADO_RAIO_METROS || 300),
  raioProximidadeMetros: Number(process.env.GEO_UNIDADE_CAMPO_DO_GADO_RAIO_PROXIMO_METROS || 700),
});

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasUnitCoordinates(unidade = GEO_UNIDADE_CAMPO_DO_GADO) {
  return Number.isFinite(Number(unidade.latitude)) && Number.isFinite(Number(unidade.longitude));
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const aLat = toNumberOrNull(lat1);
  const aLon = toNumberOrNull(lon1);
  const bLat = toNumberOrNull(lat2);
  const bLon = toNumberOrNull(lon2);
  if ([aLat, aLon, bLat, bLon].some((v) => v === null)) return null;

  const r = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function classificarLocalizacao({ latitude, longitude, status, unidade = GEO_UNIDADE_CAMPO_DO_GADO } = {}) {
  const statusInformado = String(status || '').trim().toUpperCase();
  if ([STATUS_LOCALIZACAO.NAO_AUTORIZADA, STATUS_LOCALIZACAO.GPS_INDISPONIVEL].includes(statusInformado)) {
    return { status: statusInformado, distanciaMetros: null };
  }

  const lat = toNumberOrNull(latitude);
  const lon = toNumberOrNull(longitude);
  if (lat === null || lon === null || !hasUnitCoordinates(unidade)) {
    return { status: STATUS_LOCALIZACAO.NAO_CAPTURADA, distanciaMetros: null };
  }

  const distanciaMetros = calcularDistanciaMetros(lat, lon, unidade.latitude, unidade.longitude);
  if (distanciaMetros === null) return { status: STATUS_LOCALIZACAO.NAO_CAPTURADA, distanciaMetros: null };

  if (distanciaMetros <= Number(unidade.raioPermitidoMetros || 300)) {
    return { status: STATUS_LOCALIZACAO.DENTRO_DA_UNIDADE, distanciaMetros };
  }
  if (distanciaMetros <= Number(unidade.raioProximidadeMetros || 700)) {
    return { status: STATUS_LOCALIZACAO.PROXIMO_DA_UNIDADE, distanciaMetros };
  }
  return { status: STATUS_LOCALIZACAO.FORA_DA_AREA, distanciaMetros };
}

module.exports = {
  STATUS_LOCALIZACAO,
  GEO_UNIDADE_CAMPO_DO_GADO,
  calcularDistanciaMetros,
  classificarLocalizacao,
};
