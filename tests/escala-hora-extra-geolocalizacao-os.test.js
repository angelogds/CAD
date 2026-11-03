const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('lançamento compacto permite OS ou descrição e exige localização', () => {
  const view = read('views/escala/hora-extra-nova.ejs');
  assert.match(view, /id="horaExtraOs"/);
  assert.match(view, /id="horaExtraDescricao"/);
  assert.match(view, /Obrigatório quando não houver OS/);
  assert.match(view, /data-geo-submit disabled/);
  assert.doesNotMatch(view, /Horário de Brasília/);
});

test('geolocalização nova é exigida no carregamento e no envio', () => {
  const script = read('public/js/escala-localizacao.js');
  assert.match(script, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(script, /enableHighAccuracy:true/);
  assert.match(script, /maximumAge:0/);
  assert.match(script, /const valid=await capture\(\)/);
  assert.match(script, /if\(valid&&form.dataset.before17!=='1'\)form.submit\(\)/);
  assert.match(script, /button.disabled=true/);
});

test('aprovação mostra GPS de início e fim com precisão e acesso ao mapa', () => {
  const view = read('views/escala/hora-extra-pendentes.ejs');

  assert.match(view, /latitude_' \+ context/);
  assert.match(view, /longitude_' \+ context/);
  assert.match(view, /precisao_' \+ context/);
  assert.match(view, /GPS capturado/);
  assert.match(view, /Início:/);
  assert.match(view, /Fim:/);
  assert.match(view, /Abrir no mapa/);
  assert.match(view, /google\.com\/maps\?q=/);
  assert.doesNotMatch(view, /Horário de Brasília/i);
});
