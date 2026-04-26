const test = require('node:test');
const assert = require('node:assert/strict');

const weatherService = require('../modules/tv/weather.service');

test('getWeather retorna previsão normalizada para Feira de Santana', async () => {
  weatherService._resetWeatherCacheForTest();

  const oldFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        current: {
          temperature_2m: 29.4,
          relative_humidity_2m: 68,
          precipitation: 0.2,
          weather_code: 2,
        },
        daily: {
          time: ['2026-04-26', '2026-04-27', '2026-04-28'],
          weather_code: [2, 61, 3],
          temperature_2m_max: [31.5, 30.1, 29.2],
          temperature_2m_min: [22.1, 21.8, 21.7],
          precipitation_probability_max: [15, 60, 35],
        },
      };
    },
  });

  const weather = await weatherService.getWeather();

  assert.equal(weather.available, true);
  assert.equal(weather.city, 'Feira de Santana - Campo do Gado');
  assert.equal(weather.temperature, '29°C');
  assert.equal(weather.humidity, '68%');
  assert.equal(weather.week.length, 3);
  assert.equal(weather.week[1].rainChance, '60%');

  global.fetch = oldFetch;
  weatherService._resetWeatherCacheForTest();
});

test('getWeather retorna fallback indisponível quando API falha', async () => {
  weatherService._resetWeatherCacheForTest();

  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503 });

  const weather = await weatherService.getWeather();

  assert.equal(weather.available, false);
  assert.equal(weather.city, 'Feira de Santana - Campo do Gado');
  assert.deepEqual(weather.week, []);

  global.fetch = oldFetch;
  weatherService._resetWeatherCacheForTest();
});
