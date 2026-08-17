const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('tela da OS usa ações compactas para PDF OS e WhatsApp', () => {
  const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'os', 'show.ejs'), 'utf8');
  assert.match(view, />PDF da OS</);
  assert.match(view, /data-os-module="whatsapp-os">Diagnóstico da integração WhatsApp/);
  assert.doesNotMatch(view, /Gerar PDF institucional|Enviar WhatsApp à equipe|Enviar WhatsApp local/);
});

test('template do PDF OS organiza vínculo, diagnósticos e imagens por etapa', () => {
  const template = fs.readFileSync(path.join(__dirname, '..', 'utils', 'pdf', 'pdfOS.js'), 'utf8');
  for (const section of [
    'VINCULAÇÃO À SOLICITAÇÃO DE COMPRAS',
    'DIAGNÓSTICO INICIAL',
    'DIAGNÓSTICO FINAL',
    'IMAGENS DE ABERTURA',
    'IMAGENS DE FECHAMENTO',
  ]) assert.match(template, new RegExp(section));
});
