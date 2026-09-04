const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('lançamento de hora extra prioriza OS sem bloquear exceção manual', () => {
  const view = read('views/escala/hora-extra-nova.ejs');

  assert.match(view, /Priorize a Ordem de Serviço/);
  assert.match(view, /Serviço em OS • recomendado/);
  assert.match(view, /Serviço sem OS • exceção/);
  assert.match(view, /Existem '\+openOsCount\+' Ordem\(ns\) de Serviço aberta\(s\)/);
  assert.match(view, /descricao\.required=semOs/);
  assert.match(view, /Sem OS — justificar abaixo/);
});

test('geolocalização é tentada no carregamento e novamente no envio', () => {
  const view = read('views/escala/hora-extra-nova.ejs');

  assert.match(view, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(view, /enableHighAccuracy:true/);
  assert.match(view, /timeout:8000/);
  assert.match(view, /maximumAge:30000/);
  assert.match(view, /await captureGeo\(context\)/);
  assert.match(view, /captureGeo\('inicio'\)/);
  assert.match(view, /captureGeo\('fim'\)/);
  assert.match(view, /Permissão de localização negada/);
  assert.match(view, /GPS indisponível no aparelho/);
  assert.match(view, /Tentar novamente/);
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
  assert.match(view, /não reprova automaticamente/i);
});
