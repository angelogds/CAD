const WEATHER_TTL_MS = 15 * 60 * 1000;
const FEIRA_DE_SANTANA_COORDS = {
  latitude: -12.2664,
  longitude: -38.9663,
};

let cache = {
  expiresAt: 0,
  data: null,
};

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  timeZone: 'America/Bahia',
});

function weatherCodeToLabel(code) {
  const map = {
    0: { condition: 'Céu limpo', icon: '☀️' },
    1: { condition: 'Predominantemente limpo', icon: '🌤️' },
    2: { condition: 'Parcialmente nublado', icon: '⛅' },
    3: { condition: 'Nublado', icon: '☁️' },
    45: { condition: 'Nevoeiro', icon: '🌫️' },
    48: { condition: 'Nevoeiro com geada', icon: '🌫️' },
    51: { condition: 'Garoa fraca', icon: '🌦️' },
    53: { condition: 'Garoa moderada', icon: '🌦️' },
    55: { condition: 'Garoa intensa', icon: '🌧️' },
    61: { condition: 'Chuva fraca', icon: '🌦️' },
    63: { condition: 'Chuva moderada', icon: '🌧️' },
    65: { condition: 'Chuva forte', icon: '⛈️' },
    71: { condition: 'Neve fraca', icon: '🌨️' },
    73: { condition: 'Neve moderada', icon: '🌨️' },
    75: { condition: 'Neve forte', icon: '❄️' },
    80: { condition: 'Pancadas fracas', icon: '🌦️' },
    81: { condition: 'Pancadas moderadas', icon: '🌧️' },
    82: { condition: 'Pancadas fortes', icon: '⛈️' },
    95: { condition: 'Tempestade', icon: '⛈️' },
    96: { condition: 'Tempestade com granizo', icon: '⛈️' },
    99: { condition: 'Tempestade severa', icon: '⛈️' },
  };
  return map[Number(code)] || { condition: 'Condição variável', icon: '🌤️' };
}

function formatWeekday(dateIso) {
  if (!dateIso) return '-';
  const date = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '-';
  const label = WEEKDAY_FORMATTER.format(date);
  return label.replace('.', '').slice(0, 3).toUpperCase();
}

function normalizeWeather(payload) {
  const current = payload?.current || {};
  const daily = payload?.daily || {};

  const codeMeta = weatherCodeToLabel(current.weather_code);
  const week = (daily.time || []).slice(0, 7).map((day, index) => {
    const weekCode = weatherCodeToLabel((daily.weather_code || [])[index]);
    const max = (daily.temperature_2m_max || [])[index];
    const min = (daily.temperature_2m_min || [])[index];
    const rainChance = (daily.precipitation_probability_max || [])[index];
    return {
      day: formatWeekday(day),
      date: day,
      icon: weekCode.icon,
      condition: weekCode.condition,
      max: Number.isFinite(Number(max)) ? `${Math.round(Number(max))}°C` : '-',
      min: Number.isFinite(Number(min)) ? `${Math.round(Number(min))}°C` : '-',
      rainChance: Number.isFinite(Number(rainChance)) ? `${Math.round(Number(rainChance))}%` : '-',
    };
  });

  return {
    available: true,
    city: 'Feira de Santana - Campo do Gado',
    source: 'open-meteo',
    updatedAt: new Date().toISOString(),
    temperature: Number.isFinite(Number(current.temperature_2m)) ? `${Math.round(Number(current.temperature_2m))}°C` : '-',
    condition: codeMeta.condition,
    rain: Number.isFinite(Number(current.precipitation)) ? `${Number(current.precipitation).toFixed(1)} mm` : '-',
    humidity: Number.isFinite(Number(current.relative_humidity_2m)) ? `${Math.round(Number(current.relative_humidity_2m))}%` : '-',
    icon: codeMeta.icon,
    week,
  };
}

async function fetchWeatherFromApi() {
  const params = new URLSearchParams({
    latitude: String(FEIRA_DE_SANTANA_COORDS.latitude),
    longitude: String(FEIRA_DE_SANTANA_COORDS.longitude),
    timezone: 'America/Bahia',
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: '7',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`weather_http_${response.status}`);
    }
    const payload = await response.json();
    return normalizeWeather(payload);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getWeather() {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) {
    return cache.data;
  }

  try {
    const weather = await fetchWeatherFromApi();
    cache = {
      data: weather,
      expiresAt: now + WEATHER_TTL_MS,
    };
    return weather;
  } catch (_error) {
    return {
      available: false,
      city: 'Feira de Santana - Campo do Gado',
      temperature: null,
      condition: null,
      rain: null,
      humidity: null,
      icon: null,
      week: [],
    };
  }
}

function _resetWeatherCacheForTest() {
  cache = { expiresAt: 0, data: null };
}

module.exports = {
  getWeather,
  _resetWeatherCacheForTest,
};
